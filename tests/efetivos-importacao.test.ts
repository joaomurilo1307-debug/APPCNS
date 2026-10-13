import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { interpretarStatus, lerPlanilhaEfetivos, paraDia } from "../src/lib/efetivos/importarPlanilha";

// Planilhas montadas em memoria (sem arquivo do usuario): rodam com `tsx --test`.

function xlsx(abas: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("Datas da planilha: serial do Excel, dd/mm/aaaa e aaaa-mm-dd; lixo vira null", () => {
  assert.equal(paraDia(46322), "2026-10-27"); // serial do Excel (01/01/2026 = 46023)
  assert.equal(paraDia("05/11/2026"), "2026-11-05");
  assert.equal(paraDia("2026-11-05"), "2026-11-05");
  assert.equal(paraDia(""), null);
  assert.equal(paraDia("31/02/2026"), null);
  assert.equal(paraDia("abc"), null);
  assert.equal(paraDia(12), null);
});

test("Status: mapeia os valores da planilha e nunca deixa status desconhecido virar disponivel", () => {
  assert.equal(interpretarStatus("Vigente", null, null).status, "Vigente");
  assert.equal(interpretarStatus("", null, null).status, "Vigente");
  assert.equal(interpretarStatus("Ápto com restrição", null, null).status, "Apto com restrição");
  const inss = interpretarStatus("Afastadop INSS", null, null);
  assert.equal(inss.status, "Afastado");
  assert.equal(inss.observacao, "Afastadop INSS");
  assert.equal(interpretarStatus("Em contratação", null, null).status, "Em contratação");
  const ferias = interpretarStatus("Férias", "2026-11-01", "2026-11-20");
  assert.equal(ferias.status, "Vigente");
  assert.deepEqual(ferias.ausencia, { tipo: "Férias", inicio: "2026-11-01", fim: "2026-11-20" });
  const semDatas = interpretarStatus("Atestado", null, null);
  assert.equal(semDatas.status, "Afastado"); // sem prazo: segue indisponivel e avisa
  assert.ok(semDatas.aviso);
  const estranho = interpretarStatus("Licença esquisita", null, null);
  assert.equal(estranho.status, "Afastado");
  assert.ok(estranho.aviso);
  assert.equal(interpretarStatus("Férias", "2026-11-20", "2026-11-01").status, "Afastado"); // fim antes do inicio
});

test("Formato painel: equipes, status da equipe, vagas, nome vazio e ausencia datada", () => {
  const buf = xlsx({
    Equipes: [["CADASTRO"], [], [], ["ID EQUIPE", "PROJETO BASE", "STATUS EQUIPE"], ["EQ-01", "x", "Ativa"], ["EQ-02", "x", "Em formação"]],
    Profissionais: [
      ["CADASTRO DE PROFISSIONAIS"], [], [],
      ["ID VAGA", "ID EQUIPE", "PROJETO", "GESTOR MRN", "GRUPO", "EQUIPE", "ATIVIDADE BASE", "EMPRESA", "CARGO / FUNÇÃO", "PROFISSIONAL", "STATUS ATUAL", "INÍCIO CONDIÇÃO", "FIM CONDIÇÃO", "OBSERVAÇÃO"],
      [1, "EQ-01", "3687 LT", "Ronaldo", "Fauna", "EQUIPE 01 LT", "Resgate", "Consominas", "Biólogo", "Ana Teste", "Vigente", "", "", ""],
      [2, "EQ-01", "3687 LT", "Ronaldo", "Fauna", "EQUIPE 01 LT", "Resgate", "Coopermoura/MRN", "Auxiliar", "Bia Teste", "Férias", "05/11/2026", "20/11/2026", ""],
      [3, "EQ-02", "3687 LT", "Ronaldo", "Flora", "EQUIPE 02 LT", "Afugentamento", "Consominas", "Analista", "", "Em contratação", "", "", ""],
    ],
  });
  const r = lerPlanilhaEfetivos(buf);
  assert.equal(r.formato, "painel");
  assert.deepEqual(r.equipes.map((e) => [e.codigo, e.status, e.grupo, e.nome]), [
    ["EQ-01", "Ativa", "Fauna", "EQUIPE 01 LT"],
    ["EQ-02", "Em formação", "Flora", "EQUIPE 02 LT"],
  ]);
  assert.equal(r.vagas.length, 3);
  assert.equal(r.vagas[0].nome, "Ana Teste");
  assert.equal(r.vagas[1].status, "Vigente");
  assert.deepEqual(r.vagas[1].ausencia, { tipo: "Férias", inicio: "2026-11-05", fim: "2026-11-20" });
  assert.equal(r.vagas[2].nome, null);
  assert.equal(r.vagas[2].status, "Em contratação");
  assert.equal(r.avisos.length, 0);
});

test("Formato original: nome da equipe herdado nas linhas seguintes e equipe separada por grupo", () => {
  const cab = ["ID", "PROJETO", "Gestor MRN", "GRUPO", "EQUIPE / PROJETO", "RESGATE / AFUGENTAMENTO", "EMPRESA", "CARG / FUNÇÃO", " PROFISSIONAIS", "STATUS"];
  const buf = xlsx({
    "AFUG E RESG": [
      cab,
      [],
      [1, "3687 LT", "Ronaldo", "Fauna", "EQUIPE 01 LT", "Resgate", "Consominas", "Biólogo", "Ana Teste", "Vigente"],
      [2, "3687 LT", "Ronaldo", "Fauna", "", "Resgate", "Consominas", "Biólogo", "", "Vigente"],
      [3, "3687 LT", "Ronaldo", "Flora", "", "Resgate", "Consominas", "Analista", "", "Vigente"],
      [4, "3687 LT", "Ronaldo", "Fauna", "EQUIPE 02 LT", "Resgate", "Consominas", "Biólogo", "", "Afastado INSS"],
      [5, "3687 LT", "Ronaldo", "Fauna", "EQUIPE 01 LT", "Resgate", "Consominas", "Biólogo", "", "Vigente"], // o nome reaparece depois: volta para a mesma equipe
    ],
  });
  const r = lerPlanilhaEfetivos(buf);
  assert.equal(r.formato, "original");
  assert.deepEqual(r.equipes.map((e) => [e.codigo, e.grupo, e.nome]), [
    ["EQ-01", "Fauna", "EQUIPE 01 LT"],
    ["EQ-02", "Flora", "EQUIPE 01 LT"],
    ["EQ-03", "Fauna", "EQUIPE 02 LT"],
  ]);
  assert.deepEqual(r.vagas.map((v) => v.equipeCodigo), ["EQ-01", "EQ-01", "EQ-02", "EQ-03", "EQ-01"]);
  assert.equal(r.vagas[3].status, "Afastado");
  assert.equal(r.vagas[3].observacao, "Afastado INSS");
});

test("Planilha invalida: sem colunas esperadas, sem vagas e sem nome de equipe dao erro claro ou aviso", () => {
  assert.throws(() => lerPlanilhaEfetivos(xlsx({ Aba: [["a", "b"], [1, 2]] })), /Não reconheci a planilha/);
  assert.throws(() => lerPlanilhaEfetivos(xlsx({ Profissionais: [["x"], ["y"]] })), /sem as colunas/);
  const semVagas = xlsx({
    Profissionais: [["ID VAGA", "ID EQUIPE", "PROJETO", "GRUPO"]],
  });
  assert.throws(() => lerPlanilhaEfetivos(semVagas), /nenhuma vaga/);
  const semNome = xlsx({
    P: [
      ["ID", "PROJETO", "GRUPO", "EQUIPE / PROJETO", "CARG / FUNÇÃO"],
      [1, "3636 PNM", "Fauna", "", "Biólogo"],
    ],
  });
  const r = lerPlanilhaEfetivos(semNome);
  assert.equal(r.equipes[0].nome, "(sem nome na planilha)");
  assert.equal(r.avisos.length, 1);
});

test("Formato DIVISAO DE EQUIPES (semana 42): equipe e viatura mescladas, 4x4, vago, ferias sem data e apoio de outro contrato", () => {
  const buf = xlsx({
    "AFUG ANTIGA (oculta)": [["ID", "PROJETO", "GRUPO", "EQUIPE / PROJETO", "CARG / FUNÇÃO"], [1, "3636 PNM", "Fauna", "EQUIPE VELHA", "Biólogo"]],
    "DIVISÃO DE EQUIPES": [
      ["ATIVIDADE", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"],
      ["FLANCO NORTE - EQUIPE 01", "Consominas", "Resgate", "Superior", "Médico Veterinário", "Ana Teste", "Sim", "VL 01", "Ativo"],
      ["", "Coopermoura/MRN", "Resgate", "NA", "Auxiliar", "", "", "", ""],
      ["", "Consominas", "Resgate", "Superior", "Biólogo", "Bia Teste", "Não", "VL 02", "Férias"],
      ["", "Consominas", "Afugentamento", "Técnico", "Op. de motosserra", "Vago", "", "", ""],
      ["LAVRA - EQUIPE 01", "Consominas", "Afugentamento", "Superior", "Analista Ambiental de Flora", "Caio Teste", "Sim", "VL 01", ""],
      ["", "Coopermoura/MRN", "Afugentamento", "NA", "Auxiliar", "Davi Teste", "", "", ""],
    ],
    "EQUIPE DE LT PARA APOIO": [
      ["CONTRATO", "FUNÇÃO", "PROFISSIONAL", "LIBERAÇÃO PELA SEGURANÇA", "MOBILIZADO", "LAVRA", "MIGRAR PARA", "DATA DE TRANASIÇÃO"],
      ["4362 LT", "CONSULTOR AMBIENTAL", "EVA TESTE", "Sim", "Sim", "Treinamento dia 29/09", "FELINOS", "Acaba LT 10/10"],
      ["4362 LT", "CONSULTOR AMBIENTAL", "FABIO TESTE", "Sim", "Não", "", "PMBA", "indefinido"],
    ],
  });
  const r = lerPlanilhaEfetivos(buf, { anoReferencia: 2026 });
  assert.equal(r.formato, "divisao"); // ignora a aba antiga mesmo vindo primeiro no arquivo
  assert.deepEqual(r.equipes.map((e) => [e.codigo, e.nome, e.projeto, e.grupo]), [
    ["EQ-01", "FLANCO NORTE - EQUIPE 01", "A definir", "Fauna"],
    ["EQ-02", "LAVRA - EQUIPE 01", "A definir", "Flora"], // cargo de flora -> grupo Flora
    ["EQ-03", "APOIO — 4362 LT", "4362 LT", "Apoio"],
  ]);
  const doNorte = r.vagas.filter((v) => v.equipeCodigo === "EQ-01");
  assert.equal(doNorte.length, 4);
  assert.equal(doNorte[0].direcao4x4, true);
  assert.equal(doNorte[2].direcao4x4, false);
  assert.equal(doNorte[1].nome, null); // vaga em branco
  assert.equal(doNorte[3].nome, null); // "Vago"
  assert.equal(doNorte[2].status, "Afastado"); // ferias sem data
  assert.equal(doNorte[0].nivel, "Superior");
  // viaturas: VL 01 (Ana) e VL 02 (Bia) na equipe 1; VL 01 da lavra e outra equipe
  assert.deepEqual(r.veiculos.map((v) => [v.equipeCodigo, v.identificacao, v.ocupantes]), [["EQ-01", "VL 01", 1], ["EQ-01", "VL 02", 1], ["EQ-02", "VL 01", 2]]);
  const apoio = r.vagas.filter((v) => v.contratoAtual === "4362 LT");
  assert.equal(apoio[0].disponivelAPartir, "2026-10-11"); // "acaba LT 10/10" = livre no dia seguinte
  assert.equal(apoio[0].destino, "FELINOS");
  assert.match(apoio[0].observacao ?? "", /Lavra: Treinamento dia 29\/09/);
  assert.equal(apoio[1].disponivelAPartir, null); // data que nao entendi nao inventa liberacao
  assert.ok(r.avisos.some((a) => /não entendi a data/.test(a)));
  assert.ok(r.avisos.some((a) => /não informa contrato/.test(a)));
});
