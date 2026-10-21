// Geracao automatica de dossies: regras puras, ciclo completo com Senior/PDF simulados e gravacao no banco local.
// Somente dados ARTIFICIAIS; nenhuma chamada real a Senior ou ao Gotenberg.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { access, unlink } from "node:fs/promises";
import path from "node:path";
import {
  GERANDO_VALE_MS,
  assinaturaDaOc,
  decidir,
  esperaAposFalhas,
  executarCiclo,
  janelaDeVencimento,
  motivoDeElegibilidade,
  referenciasDaOc,
  titulosAbertosDaOc,
  tituloCitadoNaOc,
  type Dependencias,
  type OcAlvo,
  type Opcoes,
  type RegistroDossie,
  type TituloAbertoSenior,
} from "../src/lib/dossie/automatico";
import { dentroDaJanela } from "../src/lib/dossie/agendador";
import { RESPOSTA_SEM_LINHAS, parametroDeChaveVazio, renderizar } from "../src/lib/dossie/motor";
import fluxo from "../src/lib/dossie/fluxo.json";
import { chaveDaOc, registrarFalha, salvarDossie } from "../src/lib/dossie/salvar";
import { prisma } from "../src/lib/prisma";
import { UPLOAD_DIR } from "../src/lib/uploadValidation";

const banco = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(banco.hostname) && banco.pathname === "/consominas_gestao_itau_homologacao", "Testes somente na base local de homologacao.");
const criadas: string[] = [];
const arquivos: string[] = [];
after(async () => {
  await prisma.dossieOC.deleteMany({ where: { chave: { in: criadas } } });
  for (const a of arquivos) await unlink(path.join(UPLOAD_DIR, a)).catch(() => {});
  await prisma.$disconnect();
});

const HOJE = "2026-10-20";
const AGORA = new Date("2026-10-20T15:00:00Z");
const opcoes: Opcoes = { hoje: HOJE, diasAtras: 30, diasFrente: 45, diasAtrasPagas: 90, lote: 12 };

const oc = (numOcp: string, extra: Partial<OcAlvo> = {}): OcAlvo => ({
  numOcp, codFil: "1", codFor: "100", fornecedorNome: `FORNECEDOR ${numOcp}`, vencimento: HOJE, sitApr: "APR", sitOcp: "1", numTit: null, numNfc: null, valor: 1000, ...extra,
});
const reg = (numOcp: string, extra: Partial<RegistroDossie> = {}): RegistroDossie => ({
  chave: chaveDaOc(1, numOcp), numOcp, status: "PUBLICADO", motivo: null, assinatura: null, tentativas: 0, arquivoPath: `dossies/${numOcp}.pdf`, titulos: [], atualizadoEm: new Date(AGORA.getTime() - 3_600_000), ...extra,
});

// ---------- regras puras ----------

test("Espera entre tentativas: 5 min, 15, 30, 1 h, 2 h, 4 h, 8 h e depois 24 h para sempre", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 20].map((n) => esperaAposFalhas(n) / 60_000), [5, 15, 30, 60, 120, 240, 480, 1440, 1440]);
  assert.equal(esperaAposFalhas(0), 5 * 60_000);
});

test("Referencias de titulo digitadas na OC: separadores do comprador e lixo", () => {
  assert.deepEqual(referenciasDaOc("398A1 - 196$01; 52/3"), ["398A1", "196$01", "52/3"]); // "/" faz parte do numero (98129/01)
  assert.deepEqual(referenciasDaOc("  abc 123 \r\n x-9 "), ["ABC 123", "X-9"]);
  assert.deepEqual(referenciasDaOc("0"), []);
  assert.deepEqual(referenciasDaOc(null), []);
});

test("Titulo citado na OC: exato, zeros a esquerda, parcela x base nos dois sentidos; outro titulo nao casa", () => {
  const citado = (refs: string, tit: string) => tituloCitadoNaOc(referenciasDaOc(refs), tit);
  assert.equal(citado("1234", "1234"), true);
  assert.equal(citado("00123", "123"), true);
  assert.equal(citado("2072$", "2072$01"), true); // comprador deixou a parcela pela metade
  assert.equal(citado("2072", "2072$03"), true); // OC com a base, titulo com parcela
  assert.equal(citado("2072$01", "2072"), true); // OC com parcela, titulo so' a base
  assert.equal(citado("398A1 - 196$01", "196$01"), true);
  assert.equal(citado("98129/01", "98129/01"), true);
  assert.equal(citado("98129/01", "251795/01"), false); // so' o final "/01" em comum: outro titulo (caso real da simulacao de 20/10/2026)
  assert.equal(citado("MIXCARGO 10/01", "MIXCARGO 10/01"), true);
  assert.equal(citado("007629", "7629"), true);
  assert.equal(citado("1234", "12345"), false);
  assert.equal(citado("2072$01", "2073$01"), false);
  assert.equal(citado("", "1"), false);
});

test("Titulos abertos da OC: so' do mesmo fornecedor e filial, sem repeticao", () => {
  const t = (numTit: string, codFor = "100", codFil = "1"): TituloAbertoSenior => ({ codFil, numTit, codTpt: "DUP", codFor });
  const abertos = [t("10$01"), t("10$02"), t("99"), t("10$01", "100", "1"), t("10$03", "100", "2")];
  assert.deepEqual(titulosAbertosDaOc(oc("1", { numTit: "10$" }), abertos), ["10$01", "10$02"]);
  assert.deepEqual(titulosAbertosDaOc(oc("1", { numTit: null }), abertos), []);
  assert.deepEqual(titulosAbertosDaOc(oc("1", { numTit: "10$", codFil: "2" }), abertos), ["10$03"]);
});

test("Assinatura: muda com titulo aberto/pago, NF, valor, aprovacao e situacao; nao muda por caixa, espaco ou ordem", () => {
  const base = oc("1", { numTit: "A1 - B2", numNfc: "77", valor: 10.5 });
  const a = assinaturaDaOc(base, ["A1"]);
  assert.equal(a, assinaturaDaOc({ ...base, numTit: "b2  -  a1" }, ["A1"]));
  assert.notEqual(a, assinaturaDaOc(base, [])); // titulo foi pago (saiu dos abertos)
  assert.notEqual(a, assinaturaDaOc(base, ["A1", "B2"])); // titulo novo aberto
  assert.notEqual(a, assinaturaDaOc({ ...base, numNfc: "78" }, ["A1"]));
  assert.notEqual(a, assinaturaDaOc({ ...base, valor: 10.51 }, ["A1"]));
  assert.notEqual(a, assinaturaDaOc({ ...base, sitOcp: "4" }, ["A1"]));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("Janela de vencimento e elegibilidade", () => {
  const { de, ate } = janelaDeVencimento(HOJE, 30, 45);
  assert.deepEqual([de, ate], ["2026-09-20", "2026-12-04"]);
  const ctx = (extra = {}) => ({ temTituloAberto: false, temVinculoManual: false, de, ate, ...extra });
  assert.equal(motivoDeElegibilidade(oc("1"), ctx()), "VENCIMENTO_NO_PERIODO");
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-09-20" }), ctx()), "VENCIMENTO_NO_PERIODO"); // limite inclusivo
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-12-05" }), ctx()), null);
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-01-10" }), ctx({ temTituloAberto: true })), "TITULO_ABERTO");
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: null }), ctx({ temVinculoManual: true })), "VINCULO_MANUAL");
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: null }), ctx()), null);
  assert.equal(motivoDeElegibilidade(oc("1", { sitApr: "ANA" }), ctx({ temTituloAberto: true })), null); // nao aprovada
  assert.equal(motivoDeElegibilidade(oc("1", { sitApr: "CAN" }), ctx({ temTituloAberto: true })), null);
  assert.equal(motivoDeElegibilidade(oc("1", { sitOcp: "5" }), ctx({ temTituloAberto: true })), null); // cancelada
  // OC ja' paga continua elegivel por mais tempo (dossie final do antigo vigia de OC quitada)
  const pagas = { paga: true, dePagas: "2026-07-22" }; // 90 dias antes de HOJE
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-08-15" }), ctx(pagas)), "OC_PAGA_RECENTE");
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-08-15" }), ctx()), null); // nao paga: fora do periodo
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-07-01" }), ctx(pagas)), null); // paga ha mais de 90 dias
  assert.equal(motivoDeElegibilidade(oc("1", { vencimento: "2026-08-15", sitApr: "CAN" }), ctx(pagas)), null);
});

test("Decisao: sem dossie, em dia, desatualizado, adotado, sem PDF, em geracao e falhas com espera", () => {
  const d = (registro: RegistroDossie | null, extra: { assinatura?: string; pdf?: boolean; agora?: Date; numTit?: string | null } = {}) =>
    decidir({ numTit: extra.numTit ?? null }, extra.assinatura ?? "AAA", registro, extra.pdf ?? true, extra.agora ?? AGORA);

  assert.deepEqual([d(null).acao, d(null).situacao, d(null).prioridade], ["GERAR", "SEM_DOSSIE", 1]);
  assert.equal(d(reg("1", { assinatura: "AAA" })).acao, "OK");
  assert.deepEqual([d(reg("1", { assinatura: "BBB" })).acao, d(reg("1", { assinatura: "BBB" })).situacao], ["GERAR", "DESATUALIZADO"]);
  // PDF do n8n/botao, sem assinatura: adota, a menos que nao cite um titulo da OC
  assert.equal(d(reg("1", { titulos: ["77"] }), { numTit: "77" }).acao, "ADOTAR");
  assert.equal(d(reg("1", { titulos: [] }), { numTit: null }).acao, "ADOTAR");
  const naoCita = d(reg("1", { titulos: ["10"] }), { numTit: "77" });
  assert.deepEqual([naoCita.acao, naoCita.situacao], ["GERAR", "DESATUALIZADO"]);
  assert.match(naoCita.motivo, /não cita o título 77/);
  assert.equal(d(reg("1", { titulos: ["2072$01"] }), { numTit: "2072$" }).acao, "ADOTAR"); // parcela pela metade na OC
  // PDF sumiu do servidor ou registro sem arquivo
  assert.deepEqual([d(reg("1", { assinatura: "AAA" }), { pdf: false }).acao, d(reg("1", { assinatura: "AAA" }), { pdf: false }).prioridade], ["GERAR", 1]);
  assert.match(d(reg("1", { assinatura: "AAA" }), { pdf: false }).motivo, /não está mais no servidor/);
  assert.equal(d(reg("1", { arquivoPath: null, status: "SEM_OC" })).acao, "GERAR"); // registro legado do n8n, sem PDF
  // geracao em curso e geracao que morreu
  assert.equal(d(reg("1", { status: "GERANDO", atualizadoEm: new Date(AGORA.getTime() - 60_000) })).acao, "AGUARDAR");
  assert.equal(d(reg("1", { status: "GERANDO", atualizadoEm: new Date(AGORA.getTime() - GERANDO_VALE_MS - 1000), tentativas: 0 })).acao, "GERAR");
  // erro: espera o intervalo da tentativa, depois tenta de novo (e nunca desiste)
  const erro = (min: number, tentativas: number) => reg("1", { status: "ERRO", motivo: "Senior respondeu HTTP 502", tentativas, atualizadoEm: new Date(AGORA.getTime() - min * 60_000) });
  assert.equal(d(erro(2, 1)).acao, "AGUARDAR");
  assert.match(d(erro(2, 1)).motivo, /falhou 1x.*502/);
  assert.equal(d(erro(6, 1)).acao, "GERAR");
  assert.equal(d(erro(20, 2)).acao, "GERAR");
  assert.equal(d(erro(50, 4)).acao, "AGUARDAR"); // 4a falha: espera 1 h
  assert.equal(d(erro(100, 4)).acao, "GERAR");
  assert.equal(d(erro(30 * 60, 12)).acao, "GERAR"); // 30 h depois da 12a falha
  assert.equal(d(erro(23 * 60, 12)).acao, "AGUARDAR");
});

test("Janela do agendador: segunda a sabado, 06h-21h59 de Sao Paulo", () => {
  assert.equal(dentroDaJanela(new Date("2026-10-20T14:00:00Z")), true); // terca 11h
  assert.equal(dentroDaJanela(new Date("2026-10-20T08:59:00Z")), false); // terca 05:59
  assert.equal(dentroDaJanela(new Date("2026-10-20T09:00:00Z")), true); // 06:00
  assert.equal(dentroDaJanela(new Date("2026-10-21T00:59:00Z")), true); // terca 21:59
  assert.equal(dentroDaJanela(new Date("2026-10-21T01:00:00Z")), false); // terca 22:00
  assert.equal(dentroDaJanela(new Date("2026-10-24T15:00:00Z")), true); // sabado
  assert.equal(dentroDaJanela(new Date("2026-10-25T15:00:00Z")), false); // domingo
});

// ---------- motor: consulta sem chave nao vai a Senior ----------

const corpoDoNo = (inicioDoNome: string, json: Record<string, unknown>) => {
  const nome = Object.keys((fluxo as any).nos).find((n) => n.startsWith(inicioDoNome));
  assert.ok(nome, `no ${inicioDoNome} nao encontrado no fluxo`);
  return renderizar((fluxo as any).nos[nome!].body, { $json: json, $: () => ({ first: () => ({ json: {} }) }), $node: {} });
};

test("Motor: OC sem nota/titulo gera consultas de chave vazia (varredura da tabela inteira na Senior) e elas nao saem", () => {
  const base = { codEmp: 1, codFil: 1, codFor: 777, codSnf: "NF", codTpt: "DUP" };
  assert.equal(parametroDeChaveVazio(corpoDoNo("Coletar Notas", { ...base, numNfc: "" })), "NumNfc");
  assert.equal(parametroDeChaveVazio(corpoDoNo("Coletar Itens Servi", { ...base, numNfc: undefined })), "NumNfc");
  assert.equal(parametroDeChaveVazio(corpoDoNo("Coletar Itens Produto", { ...base })), "NumNfc");
  assert.equal(parametroDeChaveVazio(corpoDoNo("Coletar Movimenta", { ...base, numTit: "  " })), "NumTit");
  assert.equal(parametroDeChaveVazio(corpoDoNo("Coletar T", { codEmp: 1, numTit: "" })), "NumTit");
});

test("Motor: com a chave preenchida a consulta segue normalmente", () => {
  const completo = { codEmp: 1, codFil: 1, codFor: 777, numNfc: 4521, codSnf: "NF", numTit: "4521-1", codTpt: "DUP" };
  for (const no of ["Coletar Notas", "Coletar Itens Servi", "Coletar Itens Produto", "Coletar Movimenta", "Coletar T"]) {
    assert.equal(parametroDeChaveVazio(corpoDoNo(no, completo)), null, no);
  }
  assert.equal(parametroDeChaveVazio("<soap>sem parametros</soap>"), null);
});

test("Motor: a resposta de 'zero linhas' tem o formato que os decodificadores esperam", () => {
  const m = /<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/i.exec(RESPOSTA_SEM_LINHAS);
  assert.ok(m);
  assert.equal(m![1].replace(/\s+/g, "").trim(), ""); // base64 vazio = sem registros
});

// ---------- ciclo completo com Senior e Gotenberg simulados ----------

type Cenario = {
  ocs: OcAlvo[];
  abertos?: TituloAbertoSenior[];
  vinculos?: { numTit: string; codFil: string; codFor: string; numOcp: string }[];
  pagas?: string[];
  registros?: RegistroDossie[];
  pdfAusente?: string[];
  conversor?: boolean;
  falhar?: string[];
  foraDaJanela?: OcAlvo[];
};
function montar(c: Cenario) {
  const geradas: { numOcp: number; assinatura: string; origem: string }[] = [];
  const adotadas: { chave: string; assinatura: string }[] = [];
  const marcadas: string[] = [];
  const porNumero: string[][] = [];
  const deps: Dependencias = {
    agora: () => AGORA,
    lerOcs: async () => c.ocs,
    lerOcsPorNumero: async (nums) => (porNumero.push(nums), (c.foraDaJanela ?? []).filter((o) => nums.includes(o.numOcp))),
    lerTitulosAbertos: async () => c.abertos ?? [],
    vinculosManuais: async () => c.vinculos ?? [],
    ocsPagas: async () => new Set(c.pagas ?? []),
    registros: async (nums) => (c.registros ?? []).filter((r) => r.numOcp && nums.includes(r.numOcp)),
    pdfExiste: async (p) => !(c.pdfAusente ?? []).includes(p),
    gravarAssinatura: async (chave, assinatura) => void adotadas.push({ chave, assinatura }),
    marcarGerando: async (_f, numOcp) => void marcadas.push(numOcp),
    gerar: async (o, extras) => {
      geradas.push({ numOcp: o.numOcp, assinatura: extras.assinatura, origem: extras.origem });
      return (c.falhar ?? []).includes(String(o.numOcp)) ? { ok: false, motivo: "Senior respondeu HTTP 502." } : { ok: true };
    },
    conversorDePdfDisponivel: async () => c.conversor ?? true,
    nomesFornecedores: async (codigos) => new Map(codigos.map((c) => [String(Number(c)), `NOME DO FORNECEDOR ${Number(c)}`])),
  };
  return { deps, geradas, adotadas, marcadas, porNumero };
}

test("Ciclo: gera quem falta (OC aprovada no periodo OU com titulo aberto) e ignora o resto", async () => {
  const { deps, geradas, marcadas } = montar({
    ocs: [
      oc("1"), // no periodo, sem dossie -> gera
      oc("2", { vencimento: "2026-03-01" }), // fora do periodo e sem titulo aberto -> ignora
      oc("3", { vencimento: "2026-03-01", numTit: "T3" }), // fora do periodo MAS com titulo aberto -> gera
      oc("4", { sitApr: "ANA" }), // nao aprovada
      oc("5", { sitApr: "CAN" }),
      oc("6", { sitOcp: "5" }), // cancelada
      oc("7", { vencimento: null }), // sem vencimento e sem titulo
      oc("8", { codFil: "2" }), // outra filial tambem entra (o n8n so' via a filial 1)
    ],
    abertos: [{ codFil: "1", numTit: "T3", codTpt: "DUP", codFor: "100" }],
  });
  const r = await executarCiclo(deps, opcoes);
  assert.deepEqual(geradas.map((g) => g.numOcp).sort(), [1, 3, 8]);
  assert.ok(geradas.every((g) => g.origem === "APPCNS_AUTO" && /^[0-9a-f]{16}$/.test(g.assinatura)));
  assert.deepEqual(marcadas.sort(), ["1", "3", "8"]);
  assert.equal(r.elegiveis, 3);
  assert.equal(r.geradosAgora, 3);
  assert.equal(r.pendentes.length, 0);
  assert.equal(r.atuais, 3);
});

test("Ciclo: o que ja esta em dia nao e refeito; sem assinatura adota; assinatura diferente refaz; PDF sumido refaz", async () => {
  const o1 = oc("1", { numTit: "T1" });
  const ab: TituloAbertoSenior[] = [{ codFil: "1", numTit: "T1", codTpt: "DUP", codFor: "100" }];
  const assinatura1 = assinaturaDaOc(o1, ["T1"]);
  const { deps, geradas, adotadas } = montar({
    ocs: [o1, oc("2"), oc("3"), oc("4"), oc("5")],
    abertos: ab,
    registros: [
      reg("1", { assinatura: assinatura1 }), // em dia
      reg("2", { titulos: [] }), // n8n/botao sem assinatura, sem titulo na OC -> adota
      reg("3", { assinatura: "antiga" }), // OC mudou -> refaz
      reg("4", { assinatura: "x" }), // PDF sumiu -> refaz
    ],
    pdfAusente: ["dossies/4.pdf"],
  });
  const r = await executarCiclo(deps, opcoes);
  assert.deepEqual(geradas.map((g) => g.numOcp).sort(), [3, 4, 5]);
  assert.deepEqual(adotadas.map((a) => a.chave), [chaveDaOc(1, "2")]);
  assert.equal(adotadas[0].assinatura.length, 16);
  assert.equal(r.adotados, 1);
  assert.equal(r.atuais, 5); // 1 em dia + 1 adotado + 3 gerados agora
});

test("Ciclo: falha espera o intervalo; passado o intervalo tenta de novo; OC em geracao e' deixada em paz", async () => {
  const { deps, geradas } = montar({
    ocs: [oc("1"), oc("2"), oc("3"), oc("4")],
    registros: [
      reg("1", { status: "ERRO", motivo: "timeout", tentativas: 1, arquivoPath: null, atualizadoEm: new Date(AGORA.getTime() - 60_000) }), // 1 min: espera
      reg("2", { status: "ERRO", motivo: "timeout", tentativas: 1, arquivoPath: null, atualizadoEm: new Date(AGORA.getTime() - 10 * 60_000) }), // 10 min: tenta
      reg("3", { status: "GERANDO", arquivoPath: null, atualizadoEm: new Date(AGORA.getTime() - 60_000) }), // gerando
    ],
  });
  const r = await executarCiclo(deps, opcoes);
  assert.deepEqual(geradas.map((g) => g.numOcp).sort(), [2, 4]);
  assert.deepEqual(r.pendentes.map((p) => [p.numOcp, p.situacao]).sort(), [["1", "ERRO"], ["3", "GERANDO"]]);
  assert.match(r.pendentes.find((p) => p.numOcp === "1")!.motivo, /falhou 1x; nova tentativa .*timeout/);
});

test("Ciclo: respeita o lote, gera primeiro o que nunca teve dossie e o que vence mais perto", async () => {
  const ocs = [
    oc("10", { vencimento: "2026-11-30" }),
    oc("11", { vencimento: "2026-10-21" }),
    oc("12", { vencimento: "2026-10-10" }),
    oc("13", { vencimento: "2026-10-22" }), // ja' tem dossie, mas desatualizado: vem depois dos sem dossie
    oc("14", { vencimento: "2026-10-20" }),
  ];
  const { deps, geradas } = montar({ ocs, registros: [reg("13", { assinatura: "velha" })] });
  const r = await executarCiclo(deps, { ...opcoes, lote: 3 });
  assert.deepEqual(geradas.map((g) => g.numOcp), [14, 11, 12]); // vencimento mais perto de hoje (20/10) primeiro
  assert.equal(r.geradosAgora, 3);
  assert.deepEqual(r.pendentes.map((p) => [p.numOcp, p.situacao]), [["10", "SEM_DOSSIE"], ["13", "DESATUALIZADO"]]);
});

test("Ciclo: a lista do que falta traz o nome do fornecedor mesmo quando a OC nao tem USU_NOMFOR", async () => {
  const { deps } = montar({ ocs: [oc("1", { fornecedorNome: null, codFor: "00123" }), oc("2", { fornecedorNome: "NOME NA OC" })], conversor: false });
  const r = await executarCiclo(deps, opcoes);
  const porOc = new Map(r.pendentes.map((p) => [p.numOcp, p.fornecedorNome]));
  assert.equal(porOc.get("1"), "NOME DO FORNECEDOR 123"); // buscado pelo codigo, sem zeros a esquerda
  assert.equal(porOc.get("2"), "NOME NA OC"); // o que a OC traz tem preferencia
});

test("Ciclo: sem o conversor de PDF nada e' gerado nem marcado como erro; a cobertura continua visivel", async () => {
  const { deps, geradas, marcadas } = montar({ ocs: [oc("1"), oc("2")], conversor: false });
  const r = await executarCiclo(deps, opcoes);
  assert.equal(geradas.length, 0);
  assert.equal(marcadas.length, 0);
  assert.match(r.interrompidoPor ?? "", /Gotenberg/);
  assert.equal(r.semDossie, 2);
});

test("Ciclo: tres falhas seguidas param o ciclo (nao insiste); sucesso no meio zera a contagem", async () => {
  const tres = montar({ ocs: [oc("1"), oc("2"), oc("3"), oc("4"), oc("5")], falhar: ["1", "2", "3", "4", "5"] });
  const r = await executarCiclo(tres.deps, opcoes);
  assert.equal(tres.geradas.length, 3);
  assert.equal(r.falhasAgora, 3);
  assert.match(r.interrompidoPor ?? "", /3 falhas seguidas.*502/);
  const alternado = montar({ ocs: [oc("1"), oc("2"), oc("3"), oc("4"), oc("5")], falhar: ["1", "2", "4", "5"] });
  const r2 = await executarCiclo(alternado.deps, { ...opcoes });
  // ordem 5,4,3,2,1 (mesmo vencimento -> OC maior primeiro): falha, falha, ok, falha, falha -> nunca 3 seguidas
  assert.equal(alternado.geradas.length, 5);
  assert.equal(r2.interrompidoPor, null);
  assert.equal(r2.geradosAgora, 1);
  assert.equal(r2.falhasAgora, 4);
  // quem falhou agora segue na lista do que falta, com o motivo
  assert.deepEqual(r2.pendentes.map((p) => p.numOcp).sort(), ["1", "2", "4", "5"]);
  assert.ok(r2.pendentes.every((p) => p.situacao === "ERRO" && /502/.test(p.motivo)));
  assert.equal(r2.comErro, 4);
});

test("Ciclo: OC ja' PAGA no sistema entra por 90 dias (dossie final); a nao paga com o mesmo vencimento fica de fora", async () => {
  const { deps, geradas } = montar({
    ocs: [oc("1", { vencimento: "2026-08-15" }), oc("2", { vencimento: "2026-08-15" }), oc("3", { vencimento: "2026-06-01" })],
    pagas: ["1", "3"],
  });
  const r = await executarCiclo(deps, opcoes);
  assert.deepEqual(geradas.map((g) => g.numOcp), [1]); // 2: nao paga e fora de -30d; 3: paga, mas venceu ha mais de 90 dias
  assert.equal(r.elegiveis, 1);
});

test("Ciclo: OC associada a mao a titulo aberto entra mesmo fora da janela de leitura e sem vencimento", async () => {
  const fora = oc("999", { vencimento: null, codFor: "200" });
  const { deps, geradas, porNumero } = montar({
    ocs: [],
    foraDaJanela: [fora],
    abertos: [{ codFil: "1", numTit: "M1", codTpt: "DUP", codFor: "200" }],
    vinculos: [
      { numTit: "M1", codFil: "1", codFor: "200", numOcp: "999" }, // titulo aberto -> vale
      { numTit: "PAGO", codFil: "1", codFor: "200", numOcp: "888" }, // titulo nao esta aberto -> ignora
    ],
  });
  await executarCiclo(deps, opcoes);
  assert.deepEqual(porNumero, [["999"]]);
  assert.deepEqual(geradas.map((g) => g.numOcp), [999]);
});

test("Ciclo: falha ao ler a Senior derruba o ciclo sem gerar nada nem sujar o banco", async () => {
  const { deps, geradas, marcadas } = montar({ ocs: [oc("1")] });
  deps.lerTitulosAbertos = async () => {
    throw new Error("Senior respondeu HTTP 503.");
  };
  await assert.rejects(executarCiclo(deps, opcoes), /HTTP 503/);
  assert.equal(geradas.length + marcadas.length, 0);
});

// ---------- gravacao no banco: assinatura e contagem de falhas ----------

test("Banco: salvar guarda assinatura e zera falhas; falha conta e mantem o PDF; manual nao leva assinatura", async () => {
  const chave = chaveDaOc(1, "9990001");
  criadas.push(chave);
  const pdf = { bytes: Buffer.from("%PDF-1.4\n% dossie de teste\n"), nome: "DOSSIE_TESTE.pdf" };
  const base = { chave, numOcp: "9990001", codFil: "1", titulos: ["T1"], status: "PUBLICADO" as const };

  const a = await salvarDossie({ ...base, origem: "APPCNS_AUTO", assinatura: "abc123" }, pdf);
  arquivos.push(a.arquivoPath!);
  assert.equal(a.assinatura, "abc123");
  assert.equal(a.tentativas, 0);
  assert.equal(a.origem, "APPCNS_AUTO");
  await access(path.join(UPLOAD_DIR, a.arquivoPath!));

  await registrarFalha("1", "9990001", "Senior respondeu HTTP 502.");
  const f2 = await registrarFalha("1", "9990001", "timeout");
  assert.equal(f2.status, "ERRO");
  assert.equal(f2.tentativas, 2);
  assert.equal(f2.assinatura, "abc123"); // a falha nao apaga o que ja' existia
  assert.equal(f2.arquivoPath, a.arquivoPath); // nem o PDF anterior

  const depois = await salvarDossie({ ...base, assinatura: null }, pdf); // botao manual: sem assinatura
  arquivos.push(depois.arquivoPath!);
  assert.equal(depois.status, "PUBLICADO");
  assert.equal(depois.tentativas, 0);
  assert.equal(depois.assinatura, null);
  assert.equal(depois.origem, "APPCNS");
});

test("Banco: falha numa OC sem registro cria o registro ja' contando 1 tentativa", async () => {
  const chave = chaveDaOc(1, "9990002");
  criadas.push(chave);
  const f = await registrarFalha("1", "9990002", "OC nao encontrada");
  assert.equal(f.tentativas, 1);
  assert.equal(f.status, "ERRO");
  assert.equal(f.arquivoPath, null);
});
