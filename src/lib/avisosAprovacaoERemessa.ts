// Avisos por e-mail ao AUTOR do documento (pedido da Renata 27/11/2026):
//  1. OC aprovada no APPCNS -> criador da OC (E420OCP.USUGER)
//  2. Requisicao de estoque aprovada -> solicitante (E207EME.USUSOL). Requisicao nao tem fornecedor: vai produto + quantidade.
//  3. Remessa SISPAG gerada -> criador de cada OC dos titulos que entraram (um e-mail por OC).
// E-mail sempre do E099USU.INTNET casando CODEMP (o mesmo CODUSU e' gente diferente por empresa).
// Remetente: sendAvisoEmail (informar@). Nunca derruba a aprovacao/remessa: tudo vira log.

import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { carregarVinculosOc, carregarGruposFornecedores } from "@/lib/senior/vinculosOc";
import { criarMotorVinculo, aplicarCorrecaoManual } from "@/lib/vinculoOcTitulo";
import { sendAvisoEmail } from "@/lib/mailer";
import { emailValido } from "@/lib/avisoPagamentoAprovado";

const RODAPE = "Este é um aviso automático do Consominas Gestão. Não responda este e-mail.";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const digitos = (v: unknown) => {
  const t = String(v ?? "").trim();
  return /^\d+$/.test(t) && !/^0+$/.test(t) ? String(Number(t)) : null;
};

/** Criadores (nome/e-mail) das OCs, numa consulta so'. Valores vao crus no GetDBInfo: so' digitos entram. */
export function sqlCriadoresOc(numeros: string[]): string | null {
  const nums = [...new Set(numeros.map(digitos).filter((n): n is string => !!n))];
  if (!nums.length) return null;
  // ponytail: um IN so'; se a remessa passar de algumas centenas de OCs, quebrar em lotes
  return (
    `SELECT E420OCP.CODEMP, E420OCP.CODFIL, E420OCP.NUMOCP, E099USU.NOMUSU, E099USU.INTNET FROM E420OCP, E099USU ` +
    `WHERE E420OCP.NUMOCP IN (${nums.join(",")}) AND E099USU.CODEMP = E420OCP.CODEMP AND E099USU.CODUSU = E420OCP.USUGER`
  );
}

type Destino = { email: string; nome: string };
type LinhaCriador = Record<string, string>;

/** Destinatario unico da OC (filtra empresa/filial quando conhecidas); ambiguo ou sem e-mail -> null. */
export function destinoDaOc(linhas: LinhaCriador[], numOcp: string, codEmp?: unknown, codFil?: unknown): Destino | null {
  const emp = digitos(codEmp), fil = digitos(codFil);
  const daOc = linhas.filter(
    (l) => digitos(l.NUMOCP) === digitos(numOcp) && (!emp || digitos(l.CODEMP) === emp) && (!fil || digitos(l.CODFIL) === fil) && emailValido(l.INTNET)
  );
  const emails = [...new Set(daOc.map((l) => l.INTNET.trim().toLowerCase()))];
  return emails.length === 1 ? { email: emails[0], nome: daOc[0].NOMUSU || emails[0] } : null;
}

export function textoOcAprovada(p: { numero: number; fornecedor: string; aprovadoPor: string; nome: string }) {
  return {
    subject: `OC ${p.numero} aprovada por ${p.aprovadoPor}`,
    text: [`Olá, ${p.nome}.`, ``, `A ordem de compra ${p.numero} para o fornecedor ${p.fornecedor || "não informado"} foi aprovada por ${p.aprovadoPor}.`, ``, RODAPE].join("\n"),
  };
}

export function textoRequisicaoAprovada(p: { numero: number; sequencia: number; descricao: string; quantidade: number; unidade: string; aprovadoPor: string; nome: string }) {
  const qtd = `${p.quantidade.toLocaleString("pt-BR")} ${p.unidade}`.trim();
  return {
    subject: `Requisição ${p.numero} aprovada por ${p.aprovadoPor}`,
    text: [
      `Olá, ${p.nome}.`,
      ``,
      `A requisição ${p.numero} (item ${p.sequencia}: ${p.descricao}, ${qtd}) foi aprovada por ${p.aprovadoPor}.`,
      ``,
      RODAPE,
    ].join("\n"),
  };
}

export function textoPagamentoRemessa(p: { numOcp: string; fornecedor: string; nome: string; titulos: { numTit: string; valor: number; dataPagamento: Date }[] }) {
  const total = p.titulos.reduce((s, t) => s + t.valor, 0);
  return {
    subject: `OC ${p.numOcp}: pagamento enviado ao banco`,
    text: [
      `Olá, ${p.nome}.`,
      ``,
      `O pagamento referente à OC ${p.numOcp}, para o fornecedor ${p.fornecedor || "não informado"}, foi enviado ao banco na remessa de pagamentos.`,
      ``,
      ...p.titulos.map((t) => `Título ${t.numTit}: ${brl(t.valor)}, pagamento programado para ${dataBr(t.dataPagamento)}`),
      ...(p.titulos.length > 1 ? [`Total: ${brl(total)}`] : []),
      ``,
      RODAPE,
    ].join("\n"),
  };
}

/** OC aprovada no APPCNS -> e-mail ao criador. */
export async function avisarOcAprovada(k: { codigoEmpresa: number; codigoFilial: number; numero: number }, fornecedor: string, aprovadoPor: string) {
  try {
    const sql = sqlCriadoresOc([String(k.numero)]);
    const destino = sql ? destinoDaOc(await consultarSenior(sql), String(k.numero), k.codigoEmpresa, k.codigoFilial) : null;
    if (!destino) return console.warn(`[aviso OC aprovada] OC ${k.numero}: criador sem e-mail (ou ambíguo) no Senior`);
    const ok = await sendAvisoEmail({ to: [{ email: destino.email, name: destino.nome }], ...textoOcAprovada({ numero: k.numero, fornecedor, aprovadoPor, nome: destino.nome }) });
    console.info(`[aviso OC aprovada] OC ${k.numero} -> ${destino.email}: ${ok ? "enviado" : "falhou"}`);
  } catch (e) {
    console.error(`[aviso OC aprovada] OC ${k.numero}:`, e);
  }
}

/** Item de requisicao aprovado -> e-mail ao solicitante (E099USU da empresa da requisicao). */
export async function avisarRequisicaoAprovada(
  r: { codigoEmpresa: number; numero: number; sequencia: number; descricao: string; quantidade: number; unidade: string; codSolicitante: number },
  aprovadoPor: string
) {
  try {
    const emp = digitos(r.codigoEmpresa), usu = digitos(r.codSolicitante);
    const linhas = emp && usu ? await consultarSenior(`SELECT NOMUSU, INTNET FROM E099USU WHERE CODEMP = ${emp} AND CODUSU = ${usu}`) : [];
    const l = linhas.find((x) => emailValido(x.INTNET));
    if (!l) return console.warn(`[aviso requisição] ${r.numero}/${r.sequencia}: solicitante ${r.codSolicitante} sem e-mail no Senior`);
    const email = l.INTNET.trim().toLowerCase();
    const nome = l.NOMUSU || email;
    const ok = await sendAvisoEmail({ to: [{ email, name: nome }], ...textoRequisicaoAprovada({ ...r, aprovadoPor, nome }) });
    console.info(`[aviso requisição] ${r.numero}/${r.sequencia} -> ${email}: ${ok ? "enviado" : "falhou"}`);
  } catch (e) {
    console.error(`[aviso requisição] ${r.numero}/${r.sequencia}:`, e);
  }
}

/** Remessa gerada -> mapeia OC de cada titulo (mesmo vinculo da tela) e avisa o criador de cada OC uma vez. */
export async function avisarPagamentosDaRemessa(itens: { tituloId?: string | null; valor: number; dataPagamento: string }[]) {
  try {
    const ids = [...new Set(itens.map((i) => i.tituloId).filter((id): id is string => !!id))];
    if (!ids.length) return;
    const titulos = await prisma.tituloContasAPagar.findMany({ where: { id: { in: ids } } });
    // mesmo carregamento do avisarCriadorOc (motor automatico + correcao manual)
    const ocs = await prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true,
        dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true,
        contratoNome: true, temRateio: true, previsaoPagamento: true, criadorNome: true,
      },
    });
    const porNumero = new Map(ocs.map((o) => [o.numOcp, o]));
    const motor = criarMotorVinculo(ocs, await carregarVinculosOc(prisma), await carregarGruposFornecedores());

    const porOc = new Map<string, { oc: (typeof ocs)[number]; fornecedor: string; titulos: { numTit: string; valor: number; dataPagamento: Date }[] }>();
    const semOc: string[] = [];
    for (const t of titulos) {
      const oc = porNumero.get(aplicarCorrecaoManual(t, (n) => porNumero.get(n), motor.ocRelacionadaDe(t)).ocRelacionada?.numOcp ?? "");
      if (!oc) { semOc.push(t.numTit); continue; }
      const g = porOc.get(oc.numOcp) ?? { oc, fornecedor: t.fornecedorNome || oc.fornecedorNome || "", titulos: [] };
      for (const i of itens.filter((x) => x.tituloId === t.id)) g.titulos.push({ numTit: t.numTit, valor: i.valor, dataPagamento: new Date(`${i.dataPagamento}T00:00:00Z`) });
      porOc.set(oc.numOcp, g);
    }
    if (semOc.length) console.info(`[aviso remessa] títulos sem OC vinculada (sem aviso): ${semOc.join(", ")}`);
    if (!porOc.size) return;

    const sql = sqlCriadoresOc([...porOc.keys()]);
    const linhas = sql ? await consultarSenior(sql, { timeoutMs: 120_000 }) : [];
    for (const g of porOc.values()) {
      const destino = destinoDaOc(linhas, g.oc.numOcp, undefined, g.oc.codFil);
      if (!destino) { console.warn(`[aviso remessa] OC ${g.oc.numOcp}: criador sem e-mail (ou ambíguo) no Senior`); continue; }
      const nome = g.oc.criadorNome || destino.nome;
      const ok = await sendAvisoEmail({ to: [{ email: destino.email, name: nome }], ...textoPagamentoRemessa({ numOcp: g.oc.numOcp, fornecedor: g.fornecedor, nome, titulos: g.titulos }) });
      console.info(`[aviso remessa] OC ${g.oc.numOcp} -> ${destino.email}: ${ok ? "enviado" : "falhou"}`);
    }
  } catch (e) {
    console.error("[aviso remessa] falhou:", e);
  }
}
