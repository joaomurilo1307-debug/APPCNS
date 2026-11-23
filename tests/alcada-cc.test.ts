// Tela Aprovadores por CC (23/11/2026): montagem da alcada a partir das linhas da Senior (E068CNA e cadastros). Sem banco e sem Senior.
import assert from "node:assert/strict";
import test from "node:test";
import type { LinhaSenior } from "../src/lib/senior/getDbInfo";
import { dataHoraSenior, lerDadosAlcada, montarAlcada, type DadosAlcada } from "../src/lib/senior/alcadaCc";
import { EMPRESA_OC, lerOcsDaSenior, montarItensOc, usuariosDoE099 } from "../src/lib/senior/sincronizacao/aprovacoes";

const vinculo = (p: Partial<LinhaSenior>): LinhaSenior => ({
  CODEMP: "1", CODCCU: "18", CODNAP: "1", CODUSU: "26", SITCNA: "A", USUGER: "30", DATGER: "02/02/2026", HORGER: "688", USUATU: "0", DATATU: "31/12/1900", HORATU: "0", ...p,
});

function dados(p: Partial<DadosAlcada> = {}): DadosAlcada {
  return {
    vinculos: [
      vinculo({}),
      vinculo({ CODNAP: "2", CODUSU: "26", SITCNA: "I", USUATU: "170", DATATU: "11/02/2026", HORATU: "1240" }),
      vinculo({ CODNAP: "3", CODUSU: "50", USUATU: "204", DATATU: "23/11/2026", HORATU: "714" }),
      vinculo({ CODCCU: "17", CODNAP: "1", CODUSU: "99" }),
      vinculo({ CODCCU: "17", CODNAP: "2", CODUSU: "99" }),
      vinculo({ CODCCU: "17", CODNAP: "3", CODUSU: "99" }),
      vinculo({ CODCCU: "500", CODNAP: "1", CODUSU: "26", SITCNA: "I" }),
      vinculo({ CODEMP: "2", CODCCU: "18", CODNAP: "1", CODUSU: "26" }),
    ],
    niveis: [
      ...["1", "2"].flatMap((emp) => [
        { CODEMP: emp, CODNAP: "1", DESNAP: "Coordenador", SITNAP: "A" },
        { CODEMP: emp, CODNAP: "2", DESNAP: "Gerencia", SITNAP: "A" },
        { CODEMP: emp, CODNAP: "3", DESNAP: "Diretoria", SITNAP: emp === "2" ? "I" : "A" },
      ]),
    ],
    niveisUsuario: [
      { CODEMP: "1", CODNAP: "1", CODUSU: "26", SITUNA: "A" },
      { CODEMP: "1", CODNAP: "3", CODUSU: "50", SITUNA: "I" },
      { CODEMP: "1", CODNAP: "1", CODUSU: "99", SITUNA: "A" },
    ],
    ccus: [
      { CODEMP: "1", CODCCU: "18", DESCCU: "ADM SUSTENTABILIDADE", ANASIN: "A" },
      { CODEMP: "1", CODCCU: "17", DESCCU: "ADM GERAL", ANASIN: "S" },
    ],
    usuariosEmpresa: [
      { CODEMP: "1", CODUSU: "26", NOMUSU: "geizi", INTNET: "geizi@exemplo.com", SITUSU: "A" },
      { CODEMP: "1", CODUSU: "50", NOMUSU: "andre.peres", INTNET: "andre@exemplo.com", SITUSU: "A" },
      { CODEMP: "1", CODUSU: "99", NOMUSU: "fulano.tal", INTNET: "", SITUSU: "I" },
      { CODEMP: "1", CODUSU: "30", NOMUSU: "admin.senior", INTNET: "", SITUSU: "A" },
    ],
    usuariosSgu: [
      { CODENT: "26", NOMCOM: "Geiziane Matias Sousa", DESUSU: "Planejamento e Controle", CONBLO: "0" },
      { CODENT: "50", NOMCOM: "Andre Peres", DESUSU: "", CONBLO: "1" },
    ],
    entidadesSgu: [{ CODENT: "170", NOMENT: "JOAO.SENIOR" }],
    empresas: [{ CODEMP: "1", SIGEMP: "CONSOMINAS", NOMEMP: "CONSOMINAS ENGENHARIA LTDA" }],
    ...p,
  };
}

test("data e hora da Senior", () => {
  assert.equal(dataHoraSenior("02/02/2026", "688"), "2026-02-02T11:28");
  assert.equal(dataHoraSenior("22/03/2026 11:36:14", "696"), "2026-03-22T11:36");
  assert.equal(dataHoraSenior("31/12/1900", "0"), null);
  assert.equal(dataHoraSenior("", ""), null);
  assert.equal(dataHoraSenior("05/11/2026", "0"), "2026-11-05T00:00");
});

test("um vinculo por CC, nivel e aprovador, com nomes, cadastro e quem alterou", () => {
  const linhas = montarAlcada(dados(), { ativoNaFolha: (login) => login !== "andre.peres", pessoaNoSistema: new Map([["26", "Geizi (Gestão)"]]) });
  const geiziN1 = linhas.find((l) => l.chave === "1|18|1|26")!;
  assert.equal(geiziN1.nome, "Geiziane Matias Sousa");
  assert.equal(geiziN1.login, "geizi");
  assert.equal(geiziN1.email, "geizi@exemplo.com");
  assert.equal(geiziN1.setor, "Planejamento e Controle");
  assert.equal(geiziN1.nomeCcu, "ADM SUSTENTABILIDADE");
  assert.equal(geiziN1.tipoCcu, "ANALITICO");
  assert.equal(geiziN1.empresa, "CONSOMINAS");
  assert.equal(geiziN1.nomeNivel, "Coordenador");
  assert.equal(geiziN1.situacao, "ATIVO");
  assert.equal(geiziN1.nivelDoUsuario, "ATIVO");
  assert.equal(geiziN1.usuarioSenior, "ATIVO");
  assert.equal(geiziN1.folha, "ATIVO");
  assert.equal(geiziN1.pessoaNoSistema, "Geizi (Gestão)");
  assert.equal(geiziN1.incluidoEm, "2026-02-02T11:28");
  assert.equal(geiziN1.incluidoPor, "admin.senior");
  assert.equal(geiziN1.alteradoEm, null);
  assert.equal(geiziN1.alteradoPor, null);

  const geiziN2 = linhas.find((l) => l.chave === "1|18|2|26")!;
  assert.equal(geiziN2.situacao, "INATIVO");
  assert.equal(geiziN2.nomeNivel, "Gerência");
  assert.equal(geiziN2.nivelDoUsuario, "SEM_CADASTRO");
  assert.equal(geiziN2.alteradoPor, "joao.senior", "sem E099USU, o login vem do R910ENT");

  const andre = linhas.find((l) => l.chave === "1|18|3|50")!;
  assert.equal(andre.usuarioSenior, "BLOQUEADO");
  assert.equal(andre.nivelDoUsuario, "INATIVO");
  assert.equal(andre.folha, "NAO_ENCONTRADO");
  assert.equal(andre.alteradoEm, "2026-11-23T11:54");

  const fulano = linhas.find((l) => l.chave === "1|17|1|99")!;
  assert.equal(fulano.nome, "fulano.tal", "sem R910USU, o nome e' o login");
  assert.equal(fulano.usuarioSenior, "INATIVO");
  assert.equal(fulano.tipoCcu, "SINTETICO");

  const emp2 = linhas.find((l) => l.chave === "2|18|1|26")!;
  assert.equal(emp2.empresa, "Empresa 2");
  assert.equal(emp2.usuarioSenior, "SEM_CADASTRO", "sem E099USU na empresa 2");
  assert.equal(emp2.email, "geizi@exemplo.com", "e-mail de outra empresa quando falta na propria");
  assert.equal(emp2.nomeCcu, null);
});

test("nivel sem aprovador ativo vira linha VAZIO, so' em CC com alcada ativa e nivel ativo na empresa", () => {
  const linhas = montarAlcada(dados());
  const vazios = linhas.filter((l) => l.situacao === "VAZIO").map((l) => l.chave);
  // CC 18 (emp 1): N2 so' tem a Geizi inativa. CC 17: completo. CC 500: so' inativo (fora). Emp 2: N3 inativo na empresa (fora).
  assert.deepEqual(vazios, ["1|18|2|-", "2|18|2|-"]);
  const v = linhas.find((l) => l.chave === "1|18|2|-")!;
  assert.equal(v.codUsu, null);
  assert.equal(v.nomeCcu, "ADM SUSTENTABILIDADE");
  assert.equal(v.folha, null);
});

test("sem folha guardada a coluna fica vazia; ordem por empresa, CC numerico, nivel e situacao", () => {
  const linhas = montarAlcada(dados());
  assert.ok(linhas.every((l) => l.folha === null));
  assert.deepEqual(
    linhas.map((l) => l.chave),
    ["1|17|1|99", "1|17|2|99", "1|17|3|99", "1|18|1|26", "1|18|2|-", "1|18|2|26", "1|18|3|50", "1|500|1|26", "2|18|1|26", "2|18|2|-"]
  );
});

test("vinculo repetido ou com codigo vazio e' ignorado", () => {
  const linhas = montarAlcada(dados({ vinculos: [vinculo({}), vinculo({}), vinculo({ CODUSU: "0" }), vinculo({ CODNAP: "" })] }));
  assert.equal(linhas.filter((l) => l.situacao !== "VAZIO").length, 1);
});

test("leitura: so' SELECT, empresas da alcada no filtro dos cadastros", async () => {
  const sqls: string[] = [];
  const consultar = async (sql: string) => {
    sqls.push(sql);
    return sql.includes("FROM E068CNA") ? [vinculo({ CODEMP: "1" }), vinculo({ CODEMP: "4" })] : [];
  };
  const d = await lerDadosAlcada(consultar);
  assert.equal(d.vinculos.length, 2);
  assert.ok(sqls.every((s) => /^SELECT /.test(s)));
  assert.ok(sqls.some((s) => s.includes("FROM E044CCU WHERE CODEMP IN (1,4)")));
  assert.ok(sqls.some((s) => s.includes("FROM E099USU WHERE CODEMP IN (1,4)")));
  assert.ok(sqls.every((s) => !/ROWNUM|DUAL|COUNT\(DISTINCT/i.test(s)));
});

// 23/11/2026: as duas telas (Aprovadores por CC e Aprovacoes OC Senior) mostram o mesmo login, o de ACESSO (R910ENT). O E099USU
// tinha o login antigo de 24 contas, as vezes de outra pessoa; a alcada marca a diferenca como ponto de atencao.
test("login de acesso (R910ENT) nas duas telas; login antigo do E099USU fica marcado", () => {
  const usuariosEmpresa = [
    { CODEMP: "1", CODUSU: "27", NOMUSU: "Julimar Fernando", INTNET: "financeiro@exemplo.com", SITUSU: "A" },
    { CODEMP: "9", CODUSU: "27", NOMUSU: "julimar.fernando", INTNET: "financeiro@exemplo.com", SITUSU: "A" },
    { CODEMP: "1", CODUSU: "26", NOMUSU: "geizi", INTNET: "geizi@exemplo.com", SITUSU: "A" },
    { CODEMP: "1", CODUSU: "107", NOMUSU: "reinaldo.almeida", INTNET: "", SITUSU: "A" },
  ];
  const entidadesSgu = [{ CODENT: "27", NOMENT: "MONICA.OLIVEIRA" }, { CODENT: "26", NOMENT: "GEIZI" }, { CODENT: "107", NOMENT: "RICARDO.ALMEIDA" }];
  // tela de OC: o mesmo de-para, com e sem entidades
  const oc = usuariosDoE099(usuariosEmpresa, entidadesSgu);
  assert.equal(oc.get("27")?.login, "monica.oliveira");
  assert.equal(oc.get("27")?.email, "financeiro@exemplo.com");
  assert.equal(oc.get("107")?.login, "ricardo.almeida");
  assert.equal(usuariosDoE099(usuariosEmpresa).get("107")?.login, "ricardo.almeida");
  assert.equal(usuariosDoE099([{ CODUSU: "5", NOMUSU: "ana.souza", INTNET: "" }], [{ CODENT: "6", NOMENT: "OUTRA" }]).get("5")?.login, "ana.souza");

  const linhas = montarAlcada(
    dados({
      vinculos: [vinculo({ CODUSU: "27" }), vinculo({ CODNAP: "2", CODUSU: "26" }), vinculo({ CODNAP: "3", CODUSU: "107" })],
      usuariosEmpresa,
      entidadesSgu,
      niveisUsuario: ["1", "2", "3"].map((n) => ({ CODEMP: "1", CODNAP: n, CODUSU: { 1: "27", 2: "26", 3: "107" }[n]!, SITUNA: "A" })),
    })
  );
  const porCod = new Map(linhas.filter((l) => l.codUsu).map((l) => [l.codUsu!, l]));
  assert.equal(porCod.get("27")!.login, "monica.oliveira");
  assert.equal(porCod.get("27")!.loginNoCadastro, "Julimar Fernando");
  assert.equal(porCod.get("107")!.login, "ricardo.almeida");
  assert.equal(porCod.get("107")!.loginNoCadastro, "reinaldo.almeida");
  assert.equal(porCod.get("26")!.login, "geizi");
  assert.equal(porCod.get("26")!.loginNoCadastro, null);
  // o login da tela de alcada e' o mesmo que a tela de OC usa
  for (const l of porCod.values()) assert.equal(l.login, oc.get(l.codUsu!)?.login);
});

test("busca de OCs: alcada so' da empresa das OCs (E068CNA com CODEMP) e login de acesso lido do R910ENT", async () => {
  const sqls: string[] = [];
  const consultar = async (sql: string) => {
    sqls.push(sql);
    if (sql.includes("MAX(NUMOCP)")) return [{ MX: "100" }];
    if (sql.includes("FROM E420OCP WHERE (SITAPR")) return [{ NUMOCP: "100", DATEMI: new Date().toLocaleDateString("pt-BR"), CODFOR: "1", SITAPR: "ANA", NUMAPR: "7", ROTNAP: "12" }];
    if (sql.includes("FROM E420RAT")) return [{ NUMOCP: "100", SEQRAT: "1", CTAFIN: "1", CODCCU: "260", PERRAT: "100", VLRRAT: "10" }];
    if (sql.includes("FROM E068CNA")) return [{ CODCCU: "260", CODNAP: "1", CODUSU: "13", SITCNA: "A" }];
    return [];
  };
  const { dados } = await lerOcsDaSenior(consultar, []);
  const alcada = sqls.filter((s) => s.includes("FROM E068CNA"));
  assert.equal(alcada.length, 1);
  assert.ok(alcada[0].includes(`WHERE CODEMP=${EMPRESA_OC} AND CODCCU IN ('260') AND ROTNAP=12`), alcada[0]);
  assert.ok(sqls.some((s) => s.includes("FROM R910ENT")));
  assert.ok(sqls.every((s) => /^SELECT /.test(s)));
  assert.deepEqual(dados.alcada.get("260")?.get(1), ["13"]);
});

test("folha: vale o login de acesso ou o do cadastro (a troca de login nao marca ninguem como desligado)", () => {
  const naFolha = (login: string) => login === "renan.cesar"; // a folha conhece a pessoa pelo login antigo
  const usuariosEmpresa = [{ CODEMP: "1", CODUSU: "87", NOMUSU: "renan.cesar", INTNET: "renan.cesar@exemplo.com", SITUSU: "A" }];
  const entidadesSgu = [{ CODENT: "87", NOMENT: "RENAN.BATISTA" }];
  const [l] = montarAlcada(
    dados({ vinculos: [vinculo({ CODUSU: "87" })], usuariosEmpresa, entidadesSgu, niveisUsuario: [{ CODEMP: "1", CODNAP: "1", CODUSU: "87", SITUNA: "A" }] }),
    { ativoNaFolha: naFolha }
  );
  assert.equal(l.login, "renan.batista");
  assert.equal(l.folha, "ATIVO");

  const usu = usuariosDoE099(usuariosEmpresa, entidadesSgu);
  const [oc] = montarItensOc(
    {
      ocs: [{ NUMOCP: "1", DATEMI: "10/11/2026", CODFOR: "1", VLRLIQ: "10", SITAPR: "ANA", NUMAPR: "9", ROTNAP: "12", USUGER: "87", OBSOCP: "" }],
      loginDe: new Map([["87", usu.get("87")!.login], ["5", "outra.pessoa"]]),
      loginCadastroDe: new Map([["87", usu.get("87")!.loginCadastro]]),
      nomesCcu: new Map(),
      nomesConta: new Map(),
      rateios: new Map([["1", [{ seq: 1, codccu: "400", ctafin: "", perc: 100, valor: 10 }]]]),
      exigidos: new Map([["9", { slots: new Map([[1, 1]]), sitaprRota: "" }]]),
      aprovacoes: new Map(),
      alcada: new Map([["400", new Map([[1, ["87", "5"]]])]]),
      fornecedores: new Map(),
    },
    (login) => naFolha(login) || login === "outra.pessoa"
  );
  assert.equal(oc.aprovadoresPendentes, "renan.batista, outra.pessoa"); // nao some nem vira "(desligado)"
});
