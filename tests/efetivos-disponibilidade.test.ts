import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alocacoesQueSeguram,
  atendimentoDaCampanha,
  balancoCapacidade,
  dataValida,
  diferencaDias,
  intersecta,
  livresNoPeriodo,
  montarPainel,
  serieDisponibilidade,
  somarDias,
  validarAlocacao,
  type AlocacaoBase,
  type AusenciaBase,
  type CampanhaBase,
  type DadosEfetivos,
  type EquipeBase,
  type VagaBase,
} from "../src/lib/efetivos/disponibilidade";

// Regras puras (sem banco): rodam com `tsx --test`.

const eq = (id: string, grupo: string, status = "Ativa"): EquipeBase => ({
  id,
  codigo: id.toUpperCase(),
  nome: `Equipe ${id}`,
  projeto: "3687 LT",
  gestor: "Ronaldo",
  grupo,
  status,
});

let seq = 0;
const vaga = (equipeId: string, nome: string | null, status = "Vigente"): VagaBase => ({
  id: `v${++seq}`,
  equipeId,
  nome,
  status,
  cargo: "Auxiliar de campo / Mateiro",
  empresa: "Consominas",
  atividade: "Resgate",
});

// Cenario espelhando o desenho da planilha: Fauna tem 2 equipes completas + 1 com vaga aberta
// + 1 com afastado; Flora tem 1 completa e 1 inativa.
function cenario() {
  seq = 0;
  const equipes = [eq("a", "Fauna"), eq("b", "Fauna"), eq("c", "Fauna"), eq("d", "Fauna"), eq("e", "Flora"), eq("f", "Flora", "Inativa")];
  const vagas = [
    vaga("a", "Ana"), vaga("a", "Bia"), // A completa
    vaga("b", "Caio"), vaga("b", "Davi"), // B completa
    vaga("c", "Eli"), vaga("c", null, "Em contratação"), // C com vaga aberta
    vaga("d", "Fabio"), vaga("d", "Gil", "Afastado"), // D com afastado
    vaga("e", "Hugo"), vaga("e", "Ivo"), // E completa (Flora)
    vaga("f", "Jota"), // F inativa
  ];
  const ausencias: AusenciaBase[] = [];
  const alocacoes: AlocacaoBase[] = [];
  const dados: DadosEfetivos = { equipes, vagas, ausencias, alocacoes };
  const id = (nome: string) => vagas.find((v) => v.nome === nome)!.id;
  return { dados, id, vagas, equipes };
}

test("Datas: validacao, soma de dias, diferenca e interseccao de periodos fechados", () => {
  assert.equal(dataValida("2026-10-13"), true);
  assert.equal(dataValida("2026-02-30"), false);
  assert.equal(dataValida("13/10/2026"), false);
  assert.equal(somarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(diferencaDias("2026-10-01", "2026-10-31"), 30);
  assert.equal(intersecta("2026-10-01", "2026-10-10", "2026-10-10", "2026-10-20"), true); // fecha no mesmo dia
  assert.equal(intersecta("2026-10-01", "2026-10-09", "2026-10-10", "2026-10-20"), false);
});

test("Equipe: DISPONIVEL so quando ativa, completa, sem ausencia e sem alocacao (regra da planilha)", () => {
  const { dados } = cenario();
  const p = montarPainel(dados, "2026-10-13");
  const por = Object.fromEntries(p.equipes.map((e) => [e.id, e]));
  assert.equal(por.a.situacaoRh, "COMPLETA");
  assert.equal(por.a.disponibilidade, "DISPONÍVEL");
  assert.equal(por.c.situacaoRh, "COM VAGAS");
  assert.equal(por.c.disponibilidade, "INDISPONÍVEL");
  assert.equal(por.d.situacaoRh, "COM AUSÊNCIA");
  assert.equal(por.d.disponibilidade, "INDISPONÍVEL");
  assert.equal(por.f.situacaoRh, "EQUIPE NÃO ATIVA");
  assert.equal(por.f.disponibilidade, "INDISPONÍVEL");
  assert.equal(por.a.vagasPrevistas, 2);
  assert.equal(por.c.nomesPreenchidos, 1);
});

test("Resumo por grupo: total/disponiveis/alocadas/indisponiveis e contagem de pessoas", () => {
  const { dados, id } = cenario();
  dados.alocacoes.push({ vagaId: id("Caio"), campanhaId: "k1", inicio: "2026-10-10", fim: "2026-10-20" });
  const p = montarPainel(dados, "2026-10-13");
  const fauna = p.grupos.find((g) => g.grupo === "Fauna")!;
  const flora = p.grupos.find((g) => g.grupo === "Flora")!;
  assert.deepEqual([p.grupos[0].grupo, p.grupos[1].grupo], ["Fauna", "Flora"]);
  assert.deepEqual([fauna.total, fauna.disponiveis, fauna.alocadas, fauna.indisponiveis], [4, 1, 1, 2]); // a livre, b alocada (Caio), c e d indisponiveis
  assert.deepEqual([flora.total, flora.disponiveis, flora.alocadas, flora.indisponiveis], [2, 1, 0, 1]);
  // pessoas da Fauna: 8 vagas, 7 com nome, livres Ana,Bia,Davi,Eli,Fabio = 5, alocada Caio = 1, ausente Gil = 1, aberta 1
  assert.deepEqual(fauna.pessoas, { vagas: 8, preenchidas: 7, livres: 5, alocadas: 1, ausentes: 1, abertas: 1 });
  assert.equal(p.totais.equipes, 6);
  assert.equal(p.totais.disponiveis + p.totais.alocadas + p.totais.indisponiveis, 6);
});

test("Ausencia com data: so conta dentro do periodo (limites inclusivos) e esconde a pessoa so nele", () => {
  const { dados, id } = cenario();
  dados.ausencias.push({ vagaId: id("Ana"), tipo: "Férias", inicio: "2026-11-02", fim: "2026-11-20" });
  const antes = montarPainel(dados, "2026-11-01").equipes.find((e) => e.id === "a")!;
  const dentro = montarPainel(dados, "2026-11-02").equipes.find((e) => e.id === "a")!;
  const ultimo = montarPainel(dados, "2026-11-20").equipes.find((e) => e.id === "a")!;
  const depois = montarPainel(dados, "2026-11-21").equipes.find((e) => e.id === "a")!;
  assert.equal(antes.disponibilidade, "DISPONÍVEL");
  assert.equal(dentro.situacaoRh, "COM AUSÊNCIA");
  assert.equal(ultimo.disponibilidade, "INDISPONÍVEL");
  assert.equal(depois.disponibilidade, "DISPONÍVEL");
});

test("Equipe ALOCADA quando ao menos um membro esta em campanha que segura gente; cancelada/concluida libera", () => {
  const { dados, id } = cenario();
  const campanhas = [
    { id: "k1", status: "Confirmada" },
    { id: "k2", status: "Cancelada" },
    { id: "k3", status: "Concluída" },
  ];
  const todas: AlocacaoBase[] = [
    { vagaId: id("Ana"), campanhaId: "k1", inicio: "2026-10-10", fim: "2026-10-20" },
    { vagaId: id("Davi"), campanhaId: "k2", inicio: "2026-10-10", fim: "2026-10-20" },
    { vagaId: id("Hugo"), campanhaId: "k3", inicio: "2026-10-10", fim: "2026-10-20" },
  ];
  dados.alocacoes = alocacoesQueSeguram(todas, campanhas);
  assert.equal(dados.alocacoes.length, 1);
  const p = montarPainel(dados, "2026-10-15");
  const por = Object.fromEntries(p.equipes.map((e) => [e.id, e]));
  assert.equal(por.a.disponibilidade, "ALOCADA");
  assert.equal(por.a.alocacoes, 1);
  assert.equal(por.a.livres, 1);
  assert.equal(por.b.disponibilidade, "DISPONÍVEL"); // alocacao cancelada nao segura
  assert.equal(por.e.disponibilidade, "DISPONÍVEL"); // alocacao concluida nao segura
});

test("Quem esta livre no periodo: sobreposicao parcial tira a pessoa; ignorar a propria campanha devolve", () => {
  const { dados, id } = cenario();
  dados.ausencias.push({ vagaId: id("Bia"), tipo: "Atestado", inicio: "2026-10-25", fim: "2026-10-28" });
  dados.alocacoes.push({ vagaId: id("Caio"), campanhaId: "k1", inicio: "2026-10-30", fim: "2026-11-05" });
  const r = livresNoPeriodo(dados, "2026-10-20", "2026-10-31", { grupo: "Fauna" });
  const nomesLivres = r.livres.map((p) => p.nome).sort();
  assert.deepEqual(nomesLivres, ["Ana", "Davi", "Eli", "Fabio"]); // Bia (atestado no meio), Caio (alocado no fim), Gil (afastado) fora
  const motivos = Object.fromEntries(r.indisponiveis.map((p) => [p.nome, [p.situacao, p.motivo]]));
  assert.deepEqual(motivos.Bia, ["AUSENTE", "Atestado"]);
  assert.deepEqual(motivos.Gil, ["AUSENTE", "Afastado"]);
  assert.equal(motivos.Caio[0], "ALOCADA");
  // editando a campanha k1, o Caio volta a aparecer como livre
  const edit = livresNoPeriodo(dados, "2026-10-20", "2026-10-31", { grupo: "Fauna", ignorarCampanhaId: "k1" });
  assert.ok(edit.livres.some((p) => p.nome === "Caio"));
  // equipe inativa nao oferece ninguem e filtro de grupo funciona
  const flora = livresNoPeriodo(dados, "2026-10-20", "2026-10-31", { grupo: "Flora" });
  assert.deepEqual(flora.livres.map((p) => p.nome).sort(), ["Hugo", "Ivo"]);
  assert.ok(!livresNoPeriodo(dados, "2026-10-20", "2026-10-31").livres.some((p) => p.nome === "Jota"));
});

test("Validar alocacao: bloqueia ausente, ja alocado, sem profissional, equipe inativa e id inexistente", () => {
  const { dados, id, vagas } = cenario();
  dados.alocacoes.push({ vagaId: id("Ana"), campanhaId: "outra", inicio: "2026-10-10", fim: "2026-10-20" });
  dados.ausencias.push({ vagaId: id("Davi"), tipo: "Férias", inicio: "2026-10-15", fim: "2026-10-16" });
  const vagaAberta = vagas.find((v) => v.nome === null)!.id;
  const probs = validarAlocacao(dados, "nova", [id("Ana"), id("Davi"), id("Gil"), vagaAberta, id("Jota"), "naoexiste", id("Bia")], "2026-10-14", "2026-10-18");
  const por = Object.fromEntries(probs.map((p) => [p.vagaId, p.motivo]));
  assert.equal(por[id("Ana")], "ALOCADA");
  assert.equal(por[id("Davi")], "AUSENTE");
  assert.equal(por[id("Gil")], "AUSENTE");
  assert.equal(por[vagaAberta], "SEM_PROFISSIONAL");
  assert.equal(por[id("Jota")], "EQUIPE_INATIVA");
  assert.equal(por["naoexiste"], "INEXISTENTE");
  assert.equal(por[id("Bia")], undefined); // livre
  // regravar a mesma campanha nao conflita com ela mesma
  assert.deepEqual(validarAlocacao(dados, "outra", [id("Ana")], "2026-10-14", "2026-10-18"), []);
});

test("Atendimento da campanha: suficiente, parcial e sem equipe, pelo grupo e pelo periodo inteiro", () => {
  const { dados, id } = cenario();
  const camp = (qtd: number, grupo = "Fauna"): CampanhaBase => ({
    id: "k9", codigo: "CAM-009", projeto: "3687 LT", grupo, atividade: "Resgate",
    inicio: "2026-10-20", fim: "2026-10-30", qtdEquipes: qtd, status: "Nova",
  });
  // Fauna: so A e B estao completas e livres
  assert.deepEqual(
    (({ equipesDisponiveis, saldo, atendimento }) => ({ equipesDisponiveis, saldo, atendimento }))(atendimentoDaCampanha(dados, camp(2))),
    { equipesDisponiveis: 2, saldo: 0, atendimento: "CAPACIDADE SUFICIENTE" }
  );
  assert.equal(atendimentoDaCampanha(dados, camp(3)).atendimento, "ATENDIMENTO PARCIAL");
  // uma ausencia no meio do periodo derruba a equipe A inteira para esta campanha
  dados.ausencias.push({ vagaId: id("Ana"), tipo: "Férias", inicio: "2026-10-25", fim: "2026-10-26" });
  const a = atendimentoDaCampanha(dados, camp(2));
  assert.equal(a.equipesDisponiveis, 1);
  assert.equal(a.atendimento, "ATENDIMENTO PARCIAL");
  // Flora: a equipe E esta livre; derrubando-a nao sobra nenhuma
  dados.ausencias.push({ vagaId: id("Hugo"), tipo: "Atestado", inicio: "2026-10-21", fim: "2026-10-21" });
  assert.equal(atendimentoDaCampanha(dados, camp(1, "Flora")).atendimento, "SEM EQUIPE DISPONÍVEL");
});

test("Alocada e ausente ao mesmo tempo vira conflito e e contada no painel", () => {
  const { dados, id } = cenario();
  dados.alocacoes.push({ vagaId: id("Ana"), campanhaId: "k1", inicio: "2026-10-10", fim: "2026-10-20" });
  dados.ausencias.push({ vagaId: id("Ana"), tipo: "Férias", inicio: "2026-10-15", fim: "2026-10-16" });
  assert.equal(montarPainel(dados, "2026-10-12").totais.conflitos, 0);
  assert.equal(montarPainel(dados, "2026-10-15").totais.conflitos, 1);
});

test("Serie (agora e depois) e balanco capacidade x demanda por grupo", () => {
  const { dados, id } = cenario();
  dados.ausencias.push({ vagaId: id("Ana"), tipo: "Férias", inicio: "2026-11-01", fim: "2026-11-30" });
  const s = serieDisponibilidade(dados, ["2026-10-13", "2026-11-10"]);
  assert.equal(s[0].porGrupo.Fauna.equipesDisponiveis, 2);
  assert.equal(s[1].porGrupo.Fauna.equipesDisponiveis, 1); // A saiu de ferias-equipe
  assert.equal(s[1].porGrupo.Fauna.ausentes, 2); // Ana e Gil
  const camps: CampanhaBase[] = [
    { id: "k1", codigo: "CAM-001", projeto: "3687 LT", grupo: "Fauna", atividade: "Resgate", inicio: "2026-10-01", fim: "2026-10-31", qtdEquipes: 3, status: "Confirmada" },
    { id: "k2", codigo: "CAM-002", projeto: "3687 LT", grupo: "Fauna", atividade: "Resgate", inicio: "2026-10-01", fim: "2026-10-31", qtdEquipes: 5, status: "Cancelada" },
  ];
  const b = balancoCapacidade(dados, camps, "2026-10-13");
  const fauna = b.find((x) => x.grupo === "Fauna")!;
  assert.equal(fauna.demandaEquipes, 3); // cancelada nao entra
  assert.equal(fauna.equipesCompletas, 2); // A e B (C tem vaga aberta, D tem afastado)
  assert.equal(fauna.saldo, -1); // faltam equipes
  assert.equal(fauna.vagasAbertas, 1);
  assert.equal(b.find((x) => x.grupo === "Flora")!.saldo, 1);
  assert.equal(balancoCapacidade(dados, camps, "2026-11-15").find((x) => x.grupo === "Fauna")!.demandaEquipes, 0);
});

test("Pessoa ainda em outro contrato: ocupada ate a data de liberacao e livre a partir dela", () => {
  const { dados, id } = cenario();
  const ana = dados.vagas.find((v) => v.nome === "Ana")!;
  ana.contratoAtual = "4362 LT";
  ana.disponivelAPartir = "2026-10-11"; // "acaba LT 10/10"
  const antes = montarPainel(dados, "2026-10-10").equipes.find((e) => e.id === "a")!;
  assert.equal(antes.disponibilidade, "ALOCADA");
  const depois = montarPainel(dados, "2026-10-11").equipes.find((e) => e.id === "a")!;
  assert.equal(depois.disponibilidade, "DISPONÍVEL");
  // campanha que comeca em 12/10: Ana esta livre; campanha que comeca em 08/10: nao
  assert.ok(livresNoPeriodo(dados, "2026-10-12", "2026-10-20").livres.some((p) => p.nome === "Ana"));
  const cedo = livresNoPeriodo(dados, "2026-10-08", "2026-10-20");
  assert.ok(!cedo.livres.some((p) => p.nome === "Ana"));
  assert.match(cedo.indisponiveis.find((p) => p.nome === "Ana")!.motivo ?? "", /Em 4362 LT até 2026-10-10/);
  const probs = validarAlocacao(dados, "k", [id("Ana")], "2026-10-08", "2026-10-20");
  assert.equal(probs[0].motivo, "ALOCADA");
  assert.match(String(probs[0].detalhe), /4362 LT/);
});
