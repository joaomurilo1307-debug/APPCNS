// Busca de titulos e OCs na Senior feita pelo proprio sistema (12/11/2026), no lugar do script do VPS: regras portadas do
// script (titulo, nivel/alcada da OC, desligados), novas tentativas, falha sem gravacao parcial e o estado que a tela le.
// Banco: so' a base local de homologacao. Senior: sempre simulada (funcao de consulta falsa).
import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma";
import type { LinhaSenior } from "../src/lib/senior/getDbInfo";
import { dataIso, documentoPlausivel, lerTitulosDaSenior, lerTitulosRecentesDaSenior, montarItemTitulo, numero, processarTitulos, removerTitulos, TIPOS_PAGOS } from "../src/lib/senior/sincronizacao/titulos";
import { modoDaRodada } from "../src/lib/senior/sincronizacao/agendador";
import { extrairCcTexto, montarItensOc, slotsDeNivexi, usuariosDoE099, type DadosOcs } from "../src/lib/senior/sincronizacao/aprovacoes";
import { ativoPelaFolha, situacaoDasPessoas } from "../src/lib/senior/sincronizacao/pessoasAtivas";
import { aguardarSincronizacao, comNovasTentativas, estadoDasSincronizacoes, iniciarSincronizacao } from "../src/lib/senior/sincronizacao/execucao";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/consominas_gestao_itau_homologacao", "Testes permitidos somente na base local exclusiva de homologacao.");

const tituloBase: LinhaSenior = {
  NUMTIT: "000123", CODEMP: "1", CODFIL: "1", CODFOR: "625506", CODTPT: "NFS", SITTIT: "AB", DATEMI: "05/11/2026", VCTORI: "20/11/2026",
  VCTPRO: "25/11/2026", VLRORI: "1.234,56", VLRABE: "1.234,56", CODCCU: "17", ULTPGT: "31/12/1900", NUMOCP: "0", CODBAN: "0", TIPTCC: "",
  CODAGE: "", CCBFOR: "", CODBAR: "0", DOCIDEFAV: "0", TPCPIX: "0", CHVPIX: "", CODFPG: "3", USU_NUMOCP: "",
};

test("datas, numeros e documento como o script lia", () => {
  assert.equal(dataIso("05/11/2026"), "2026-11-05");
  assert.equal(dataIso("31/12/1900"), null);
  assert.equal(dataIso(""), null);
  assert.equal(numero("1.234,56"), 1234.56);
  assert.equal(numero("100,00"), 100);
  assert.equal(documentoPlausivel("1557161666", "F"), "01557161666"); // CGCCPF NUMBER perde o zero (30/09/2026)
  assert.equal(documentoPlausivel("1557161666", "J"), null);
  assert.equal(documentoPlausivel("11111111111"), null);
});

test("titulo: pago pelo saldo, OC pelo USU_NUMOCP, conta do cadastro de outra empresa, boleto so' quando valido", () => {
  const nomes = new Map([["17", "ADM MARKETING"]]);
  const aberto = montarItemTitulo({ ...tituloBase, USU_NUMOCP: "16584" }, { nome: "EDILSON", tipo: "F", cgccpf: "1557161666" }, [
    { CODFOR: "625506", CODEMP: "2", CODFIL: "1", CODBAN: "1", TIPTCC: "1", CODAGE: "1234", CCBFOR: "12345-6", DOCIDEFAV: "0" },
  ], nomes)!;
  assert.equal(aberto.pago, false);
  assert.equal(aberto.dataPagamento, null);
  assert.equal(aberto.valorOriginal, 1234.56);
  assert.equal(aberto.numOcp, "16584");
  assert.equal(aberto.ccuNome, "ADM MARKETING");
  assert.deepEqual([aberto.bancoFavorecido, aberto.agenciaFavorecido, aberto.contaFavorecido, aberto.dacFavorecido], ["001", "1234", "12345", "6"]);
  assert.equal(aberto.documentoFavorecido, "01557161666");
  assert.ok(!("codigoBarrasBoleto" in aberto), "sem codigo valido o campo nao vai (nao apaga o digitado no app)");
  assert.ok(!("numNfc" in aberto) && !("descricao" in aberto), "sem NF/historico na Senior os campos nao vao (nao apagam o que existe)");
  const comNf = montarItemTitulo({ ...tituloBase, NUMNFC: "4521", OBSTCP: " LOCACAO DE VEICULO ", USUGER: "107", DATGER: "04/11/2026" }, undefined, undefined, nomes)!;
  assert.deepEqual([comNf.numNfc, comNf.descricao, comNf.lancadoPorCod, comNf.dataLancamento], ["4521", "LOCACAO DE VEICULO", "107", "2026-11-04"]);
  assert.equal(aberto.codFpg, "3");

  const pago = montarItemTitulo({ ...tituloBase, VLRABE: "0,00", ULTPGT: "10/11/2026", CODBAR: "8".repeat(48) }, undefined, undefined, nomes)!;
  assert.equal(pago.pago, true);
  assert.equal(pago.dataPagamento, "2026-11-10");
  assert.equal(pago.codigoBarrasBoleto, "8".repeat(48));
  assert.equal(montarItemTitulo({ ...tituloBase, DATEMI: "31/12/1900" }, undefined, undefined, nomes), null);
});

function senioFalsa(respostas: (sql: string) => LinhaSenior[] | Error) {
  const consultas: string[] = [];
  const consultar = async (sql: string) => {
    consultas.push(sql);
    const r = respostas(sql);
    if (r instanceof Error) throw r;
    return r;
  };
  return { consultar, consultas };
}

test("titulos: pagos em pedacos por tipo + 'todos os outros tipos'; qualquer consulta que falha interrompe tudo", async () => {
  const { consultar, consultas } = senioFalsa((sql) => {
    if (sql.includes("SITTIT='AB'")) return [tituloBase];
    if (sql.includes("CODTPT NOT IN")) return [{ ...tituloBase, NUMTIT: "999", CODTPT: "XYZ", SITTIT: "LQ", VLRABE: "0,00" }];
    if (sql.includes("SITTIT='LQ' AND CODTPT='OUT'")) return [{ ...tituloBase, NUMTIT: "777", CODTPT: "OUT", SITTIT: "LQ", VLRABE: "0,00" }];
    if (sql.includes("E095FOR")) return [{ CODFOR: "625506", NOMFOR: "FORNECEDOR X", APEFOR: "", CGCCPF: "52998224725", TIPFOR: "F" }];
    return [];
  });
  const { itens } = await lerTitulosDaSenior(consultar);
  assert.equal(consultas.filter((s) => s.includes("SITTIT='LQ'")).length, TIPOS_PAGOS.length + 1);
  assert.deepEqual(itens.map((i) => i.numTit).sort(), ["000123", "777", "999"]);
  assert.ok(itens.every((i) => i.fornecedorNome === "FORNECEDOR X"));

  const falha = senioFalsa((sql) => (sql.includes("CODTPT='FAT'") ? new Error("Senior respondeu HTTP 500.") : []));
  await assert.rejects(() => lerTitulosDaSenior(falha.consultar), /HTTP 500/);
});

test("busca rapida: abertos + outras situacoes + os que sairam de aberto pelo numero; sem historico de pagos", async () => {
  const conhecido = (numTit: string) => ({ numTit, codFil: "1", codFor: "625506", tipo: "NFS", dataEmissao: new Date("2026-11-05") });
  const { consultar, consultas } = senioFalsa((sql) => {
    if (sql.includes("SITTIT='AB'")) return [{ ...tituloBase, NUMTIT: "A" }];
    if (sql.includes("NUMTIT IN")) return [{ ...tituloBase, NUMTIT: "B", SITTIT: "LQ", VLRABE: "0,00", ULTPGT: "11/11/2026" }, { ...tituloBase, NUMTIT: "B", CODFOR: "777" }];
    return [];
  });
  const r = await lerTitulosRecentesDaSenior(consultar, [conhecido("A"), conhecido("B"), conhecido("C")]);
  assert.equal(consultas.some((s) => s.includes("SITTIT='LQ'")), false, "historico de pagos fica para a busca completa");
  assert.match(consultas.find((s) => s.includes("NUMTIT IN"))!, /NUMTIT IN \('B','C'\)/);
  assert.deepEqual(r.itens.map((i) => `${i.numTit}/${i.codFor}`).sort(), ["A/625506", "B/625506", "B/777"]);
  assert.equal(r.itens.find((i) => i.numTit === "B" && i.codFor === "625506")!.pago, true);
  assert.deepEqual(r.sumiram.map((t) => t.numTit), ["C"]);
});

test("modo da rodada: completa se nunca rodou, se tem mais de 24 h, ou de madrugada com mais de 12 h", () => {
  const as = (iso: string) => new Date(iso);
  assert.equal(modoDaRodada(null), "completa");
  assert.equal(modoDaRodada(as("2026-11-11T14:00:00Z"), as("2026-11-12T15:00:00Z")), "completa"); // 25 h
  assert.equal(modoDaRodada(as("2026-11-12T15:00:00Z"), as("2026-11-12T17:00:00Z")), "rapida"); // 14h em SP, 2 h
  assert.equal(modoDaRodada(as("2026-11-11T17:00:00Z"), as("2026-11-12T06:00:00Z")), "completa"); // 3h em SP, 13 h
  assert.equal(modoDaRodada(as("2026-11-12T00:00:00Z"), as("2026-11-12T06:00:00Z")), "rapida"); // 3h em SP, 6 h
  assert.equal(modoDaRodada(null, new Date(), true), "rapida"); // logo depois de subir: rapida primeiro
});

test("novas tentativas so' para falha passageira", async () => {
  let chamadas = 0;
  const instavel = comNovasTentativas(async () => {
    chamadas++;
    if (chamadas < 3) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    return [{ OK: "1" }];
  }, async () => {});
  assert.deepEqual(await instavel("SELECT 1"), [{ OK: "1" }]);
  assert.equal(chamadas, 3);

  chamadas = 0;
  const recusa = comNovasTentativas(async () => {
    chamadas++;
    throw new Error("Senior recusou a consulta. Os dados nao puderam ser conferidos.");
  }, async () => {});
  await assert.rejects(() => recusa("SELECT 1"), /recusou/);
  assert.equal(chamadas, 1);
});

test("NIVEXI, centro de custo no texto e de-para de usuarios", () => {
  const obj = (m: Map<number, number>) => Object.fromEntries(m);
  assert.deepEqual(obj(slotsDeNivexi("(1)*(2)*(3)")), { 1: 1, 2: 1, 3: 1 });
  assert.deepEqual(obj(slotsDeNivexi("(1*1)")), { 1: 2 });
  assert.deepEqual(obj(slotsDeNivexi("(1*1*1*1)*(2*2*2)")), { 1: 4, 2: 3 });
  assert.deepEqual(obj(slotsDeNivexi("")), { 1: 1 });
  assert.equal(extrairCcTexto("Compra de toner. C/C: ADM MARKETING."), "ADM MARKETING");
  assert.equal(extrairCcTexto("CC: MRN 3748"), "MRN 3748");
  assert.equal(extrairCcTexto("sem centro"), null);
  const u = usuariosDoE099([
    { CODUSU: "107", NOMUSU: "reinaldo.almeida", INTNET: "" },
    { CODUSU: "5", NOMUSU: "ana.souza", INTNET: "" },
    { CODUSU: "5", NOMUSU: "ana.souza", INTNET: "ana@consominas.com.br" },
    { CODUSU: "0", NOMUSU: "ninguem", INTNET: "" },
  ]);
  assert.equal(u.get("107")?.login, "ricardo.almeida"); // cadastro errado no proprio Senior (11/09/2026)
  assert.equal(u.get("5")?.email, "ana@consominas.com.br");
  assert.equal(u.has("0"), false);
});

function dadosOc(parcial: Partial<DadosOcs> & { oc?: Partial<LinhaSenior> }): DadosOcs {
  return {
    ocs: [{ NUMOCP: "3184", DATEMI: "10/11/2026", CODFOR: "10", USU_NOMFOR: "", VLRLIQ: "0", VLRORI: "309,90", VLRFIN: "0", SITAPR: "ANA", NUMAPR: "500", ROTNAP: "12", USUGER: "7", USU_DATVECT: "20/11/2026", OBSOCP: "C/C: ADM MARKETING.", USU_NUMTIT: "", USU_NUMNFC: "", ...parcial.oc }],
    loginDe: new Map([["1", "joao.silva"], ["2", "maria.lima"], ["3", "gabriel.ceccon"], ["4", "ana.souza"]]),
    nomesCcu: new Map([["A", "CENTRO A"], ["B", "CENTRO B"], ["C", "CENTRO C"]]),
    nomesConta: new Map([["191", "R - DESPESAS REEMBOLSAVEIS"]]),
    rateios: new Map(),
    exigidos: new Map(),
    aprovacoes: new Map(),
    alcada: new Map(),
    fornecedores: new Map([["10", "FORNECEDOR DEZ"]]),
    ...parcial,
  };
}

test("OC: nivel compartilhado entre centros do rateio (OC 3184) e cabecalho ANA com rota ja aprovada", () => {
  const [oc] = montarItensOc(
    dadosOc({
      rateios: new Map([["3184", ["A", "B", "C"].map((cc, i) => ({ seq: i + 1, codccu: cc, ctafin: "191", perc: 33.3333, valor: 103.3 }))]]),
      exigidos: new Map([["500", { slots: slotsDeNivexi("(1)"), sitaprRota: "APR" }]]),
      aprovacoes: new Map([["500", { porCcNiv: new Map([["A|1", { usu: "1", data: "11/11/2026" }]]), globalNiv: new Map(), linhas: [] }]]),
      alcada: new Map([["B", new Map([[1, ["2"]]])]]),
    }),
    () => true
  );
  assert.equal(oc.situacaoAtual, "APR");
  assert.equal(oc.niveisAprovados, "1");
  assert.equal(oc.aprovadoresPendentes, null);
  const rateio = JSON.parse(oc.rateioDetalhe!);
  assert.deepEqual(rateio.map((l: any) => l.niveis[0].status), ["aprovado", "aprovado", "aprovado"]);
  assert.equal(rateio[0].contaFinanceira, "R - DESPESAS REEMBOLSAVEIS");
  assert.equal(oc.valor, 309.9); // VLRLIQ zerado, VLRORI certo (OC 15115)
  assert.equal(oc.fornecedorNome, "FORNECEDOR DEZ");
  assert.equal(oc.contratoTexto, "ADM MARKETING");
  assert.equal(oc.temRateio, true);
  assert.equal(oc.codccu, null);
});

test("OC: uma assinatura por centro quando a exigencia cobre todos (OC 15354) e desligado fora da lista", () => {
  const base = {
    rateios: new Map([["3184", [{ seq: 1, codccu: "A", ctafin: "", perc: 50, valor: 10 }, { seq: 2, codccu: "B", ctafin: "", perc: 50, valor: 10 }]]]),
    exigidos: new Map([["500", { slots: slotsDeNivexi("(1*1)*(2)"), sitaprRota: "ANA" }]]),
    aprovacoes: new Map([["500", { porCcNiv: new Map([["A|1", { usu: "1", data: "11/11/2026" }]]), globalNiv: new Map(), linhas: [{ NUMAPR: "500", SEQAPR: "1", NIVAPR: "1", USUAPR: "1", SITAPR: "APR", CCUAPR: "A", DATAPR: "11/11/2026" }] }]]),
    alcada: new Map([["B", new Map([[1, ["2", "3"]]])]]),
  };
  const desligado = (login: string) => login !== "gabriel.ceccon";
  const [oc] = montarItensOc(dadosOc(base), desligado);
  assert.equal(oc.nivelAtual, 1);
  assert.equal(oc.niveisAprovados, "");
  assert.equal(oc.aprovadoresPendentesCod, "2");
  assert.equal(oc.aprovadoresPendentes, "maria.lima");
  assert.equal(oc.proximoAprovadorCod, "2");
  const linhaB = JSON.parse(oc.rateioDetalhe!)[1];
  assert.deepEqual(linhaB.niveis[0].aprovadoresCod, ["2"]);
  assert.equal(JSON.parse(oc.historicoNiveis!)[0].USUAPR, "1");

  // nivel so' com desligado: continua aparecendo, marcado (melhor que ficar sem aprovador)
  const [soDesligado] = montarItensOc(dadosOc({ ...base, alcada: new Map([["B", new Map([[1, ["3"]]])]]) }), desligado);
  assert.equal(soDesligado.aprovadoresPendentes, "gabriel.ceccon (desligado)");
  assert.equal(soDesligado.aprovadoresPendentesCod, "3");
});

test("pessoa ativa pela folha: todos os pedacos do login no nome completo", () => {
  const ativo = ativoPelaFolha(["RICARDO LUIS DE ALMEIDA", "ANA PAULA SOUZA"]);
  assert.equal(ativo("ricardo.almeida"), true);
  assert.equal(ativo("reinaldo.almeida"), false);
  assert.equal(ativo("ana.souza"), true);
});

test("lista de pessoas: folha lida e guardada; folha falhou usa a guardada; sem folha usa os desligados ja marcados", async () => {
  const numOcp = `9${String(Date.now()).slice(-8)}`;
  await prisma.rosterAtivoSenior.deleteMany();
  try {
    const lida = await situacaoDasPessoas({ lerFolha: async () => ["Ana Paula Souza"], pausaMs: 0 });
    assert.equal(lida.fonte, "FOLHA");
    assert.equal(lida.ativo("ana.souza"), true);
    assert.equal(lida.ativo("gabriel.ceccon"), false);

    const guardada = await situacaoDasPessoas({ lerFolha: async () => { throw new Error("tempo esgotado"); }, pausaMs: 0 });
    assert.equal(guardada.fonte, "FOLHA_GUARDADA");
    assert.equal(guardada.ativo("ana.souza"), true);

    await prisma.rosterAtivoSenior.deleteMany();
    await prisma.aprovacaoSenior.create({ data: { numOcp, dataEmissao: new Date(), fornecedorCodigo: "1", valor: 1, numApr: "0", situacaoAtual: "ANA", aprovadoresPendentes: "gabriel.ceccon (desligado), ana.souza" } });
    const marcados = await situacaoDasPessoas({ lerFolha: async () => null, pausaMs: 0 });
    assert.equal(marcados.fonte, "DESLIGADOS_JA_MARCADOS");
    assert.equal(marcados.ativo("gabriel.ceccon"), false);
    assert.equal(marcados.ativo("ana.souza"), true);
  } finally {
    await prisma.aprovacaoSenior.deleteMany({ where: { numOcp } });
    await prisma.rosterAtivoSenior.deleteMany();
  }
});

test("gravacao de titulos: limpeza suspensa quando apagaria demais, nada apagado", async () => {
  const numTit = `SYNC${Date.now()}`;
  const antes = await prisma.tituloContasAPagar.count();
  try {
    const item = montarItemTitulo({ ...tituloBase, NUMTIT: numTit }, undefined, undefined, new Map())!;
    const r = await processarTitulos([item], { limiteRemocao: 0 });
    assert.equal(r.processados, 1);
    assert.equal(r.removidos, 0);
    assert.equal(r.remocaoSuspensa, antes);
    assert.equal(await prisma.tituloContasAPagar.count(), antes + 1);
    assert.equal(await removerTitulos([{ numTit, codFil: item.codFil, codFor: item.codFor, tipo: item.tipo, dataEmissao: new Date(item.dataEmissao) }]), 1);
    assert.equal(await prisma.tituloContasAPagar.count(), antes);
  } finally {
    await prisma.tituloContasAPagar.deleteMany({ where: { numTit } });
  }
});

test("busca de OCs: falha fica registrada sem gravar; sucesso grava e a tela le quantidade e horario", async () => {
  const numOcp = `8${String(Date.now()).slice(-8)}`;
  // OC ja aprovada: nao gera notificacao (outros testes em paralelo apagam usuarios, e a notificacao tem chave estrangeira).
  const linhaOc = { NUMOCP: numOcp, DATEMI: new Date().toLocaleDateString("pt-BR"), CODFOR: "10", USU_NOMFOR: "FORNECEDOR TESTE SYNC", VLRLIQ: "150,00", VLRORI: "0", VLRFIN: "0", SITAPR: "APR", NUMAPR: "0", ROTNAP: "12", USUGER: "SYNCT1", USU_DATVECT: "", OBSOCP: "", USU_NUMTIT: "", USU_NUMNFC: "" };
  try {
    const recusa = senioFalsa(() => new Error("Senior recusou a consulta. Os dados nao puderam ser conferidos."));
    const r1 = iniciarSincronizacao("ocs", "BOTAO", "teste", recusa.consultar);
    assert.equal(iniciarSincronizacao("ocs", "BOTAO", "teste", recusa.consultar).jaEmAndamento, true, "segundo clique acompanha a mesma busca");
    await aguardarSincronizacao("ocs");
    let estado = (await estadoDasSincronizacoes()).find((e) => e.fonte === "ocs")!;
    assert.equal(estado.emAndamento, false);
    assert.ok(new Date(estado.falhaEm!).getTime() >= r1.iniciadaEm.getTime());
    assert.match(estado.falha!, /usuários da Senior: Senior recusou a consulta/);
    assert.equal(await prisma.aprovacaoSenior.count({ where: { numOcp } }), 0);

    const ok = senioFalsa((sql) => {
      if (sql.includes("E099USU")) return [{ CODUSU: "SYNCT1", NOMUSU: "teste.sync", INTNET: "" }];
      if (sql.includes("MAX(NUMOCP)")) return [{ MX: numOcp }];
      if (sql.includes("FROM E420OCP WHERE (SITAPR")) return [linhaOc];
      return [];
    });
    const r2 = iniciarSincronizacao("ocs", "BOTAO", "teste", ok.consultar);
    await aguardarSincronizacao("ocs");
    estado = (await estadoDasSincronizacoes()).find((e) => e.fonte === "ocs")!;
    assert.ok(new Date(estado.sucessoEm!).getTime() >= r2.iniciadaEm.getTime(), estado.falha ?? "sem sucesso");
    assert.equal(estado.quantidade, 1);
    const gravada = await prisma.aprovacaoSenior.findUniqueOrThrow({ where: { numOcp } });
    assert.equal(gravada.fornecedorNome, "FORNECEDOR TESTE SYNC");
    assert.equal(gravada.valor, 150);
    assert.equal(gravada.situacaoAtual, "APR");
    assert.equal(gravada.criadorNome, "Teste Sync");
  } finally {
    const oc = await prisma.aprovacaoSenior.findUnique({ where: { numOcp } });
    if (oc) {
      await prisma.aprovacaoSeniorEvento.deleteMany({ where: { aprovacaoSeniorId: oc.id } });
      await prisma.aprovacaoSenior.delete({ where: { id: oc.id } });
    }
    await prisma.notification.deleteMany({ where: { title: { contains: `OC ${numOcp} ` } } });
    await prisma.usuarioSenior.deleteMany({ where: { codigo: "SYNCT1" } });
    await prisma.sincronizacaoSenior.deleteMany({ where: { fonte: "ocs" } });
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
