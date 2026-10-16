import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { COD_EMP } from "@/lib/senior/ocsConferencia";
import { listarNotasRecebidas, type NotaRecebida } from "@/lib/edocs/notasRecebidas";
import { pagamentoDasNotas } from "@/lib/edocs/pagamentoNotas";

// Alertas do financeiro: NF recebidas novas, NF com vencimento (do XML) perto/vencido que ainda NAO foi
// lancada na Senior, e titulos a pagar perto/vencidos. Calcula na hora; "notificarAlertas" cria o aviso no
// sino uma unica vez por chave (AlertaFinanceiroEnviado).

export const ANTECEDENCIA_DIAS = 3; // "prestes a vencer"
const NOVA_ATE_DIAS = 7; // NF emitida ha ate 7 dias e ainda nao avisada
const CACHE_MS = 5 * 60 * 1000;

export const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
/** Dias de `data` ate `hoje`: positivo = faltam, negativo = vencida. Ambos yyyy-mm-dd. */
export const diasAte = (data: string, hoje: string) => Math.round((Date.parse(data.slice(0, 10)) - Date.parse(hoje)) / 86_400_000);

// Datas-sentinela da Senior (nao sao vencimentos reais) -- mesma regra da Programacao de Pagamento.
export function vencimentoSentinela(dia: string) {
  const [ano, mes, d] = dia.split("-").map(Number);
  return ano <= 1950 || (ano >= 2030 && mes === 12 && d >= 28);
}

export type AlertaNota = NotaRecebida & { vencimento: string; dias: number };
export type AlertaTitulo = { id: string; numTit: string; fornecedorNome: string; valorAberto: number; vencimento: string; dias: number };
export type Alertas = {
  geradoEm: string;
  notasNovas: NotaRecebida[];
  notasVencidas: AlertaNota[]; // vermelho: vencida e nao lancada na Senior
  notasVencendo: AlertaNota[]; // nao lancada na Senior
  notasLancadas: AlertaNota[]; // vencida/vencendo, mas ja lancada na Senior (nao alerta)
  titulosVencidos: AlertaTitulo[]; // vermelho
  titulosVencendo: AlertaTitulo[];
  avisos: string[];
};

function lotes<T>(l: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < l.length; i += n) r.push(l.slice(i, i + n));
  return r;
}

/** Chaves das NF que ja estao lancadas na Senior (E440NFC): fornecedor achado pelo CNPJ (E095FOR) + numero da nota. */
async function notasLancadasNaSenior(notas: NotaRecebida[]): Promise<Set<string>> {
  const lancadas = new Set<string>();
  for (const grupo of lotes(notas, 40)) {
    const cnpjs = [...new Set(grupo.map((n) => String(Number(n.cnpj))))]; // CGCCPF e' NUMBER na Senior (perde zeros a esquerda)
    const codForPorCnpj = new Map<string, string[]>();
    for (const r of await consultarSenior(`SELECT CODFOR, CGCCPF FROM E095FOR WHERE CGCCPF IN (${cnpjs.join(",")})`)) {
      const k = String(Number(r.CGCCPF));
      codForPorCnpj.set(k, [...(codForPorCnpj.get(k) ?? []), String(Number(r.CODFOR))]);
    }
    const codFors = [...new Set([...codForPorCnpj.values()].flat())];
    if (!codFors.length) continue;
    const numeros = [...new Set(grupo.map((n) => String(Number(n.numero))))];
    const achadas = new Set(
      (await consultarSenior(`SELECT CODFOR, NUMNFC FROM E440NFC WHERE CODEMP IN (${COD_EMP}) AND CODFOR IN (${codFors.join(",")}) AND NUMNFC IN (${numeros.join(",")})`)).map(
        (r) => `${Number(r.CODFOR)}|${Number(r.NUMNFC)}`
      )
    );
    for (const n of grupo) {
      if ((codForPorCnpj.get(String(Number(n.cnpj))) ?? []).some((cf) => achadas.has(`${cf}|${Number(n.numero)}`))) lancadas.add(n.chave);
    }
  }
  return lancadas;
}

let cache: { em: number; alertas: Alertas } | null = null;

export async function calcularAlertas(forcar = false): Promise<Alertas> {
  if (!forcar && cache && Date.now() - cache.em < CACHE_MS) return cache.alertas;
  const hoje = hojeBR();
  const avisos: string[] = [];

  let notas: NotaRecebida[] = [];
  try {
    notas = await listarNotasRecebidas(forcar);
  } catch (e) {
    avisos.push(`eDocs indisponível: ${(e as Error).message}`);
  }
  const notasNovas = notas.filter((n) => n.emissao && diasAte(n.emissao, hoje) >= -NOVA_ATE_DIAS);

  // Vencimento da NF = o mais proximo informado no XML (le os XMLs que faltam, ate' 25 s; o resto fica pra proxima).
  const lidos = await pagamentoDasNotas(notas, 25_000);
  const vencPorChave = new Map([...lidos.values()].filter((l) => l.vencimentos.length).map((l) => [l.chave, [...l.vencimentos].sort()[0]]));
  const candidatas: AlertaNota[] = notas
    .filter((n) => vencPorChave.has(n.chave))
    .map((n) => ({ ...n, vencimento: vencPorChave.get(n.chave)!, dias: diasAte(vencPorChave.get(n.chave)!, hoje) }))
    .filter((n) => n.dias <= ANTECEDENCIA_DIAS);

  let lancadas = new Set<string>();
  try {
    lancadas = await notasLancadasNaSenior(candidatas);
  } catch (e) {
    avisos.push(`Não foi possível conferir na Senior se as notas já foram lançadas (todas aparecem como não lançadas): ${(e as Error).message}`);
  }
  const porVenc = (a: { dias: number }, b: { dias: number }) => a.dias - b.dias;
  const naoLancadas = candidatas.filter((n) => !lancadas.has(n.chave));

  const titulos = await prisma.tituloContasAPagar.findMany({
    where: { pago: false, tipo: { not: "PRV" }, vencimentoProgramado: { not: null } },
    select: { id: true, numTit: true, fornecedorNome: true, codFor: true, valorAberto: true, vencimentoProgramado: true },
  });
  const titulosAlerta: AlertaTitulo[] = titulos
    .map((t) => {
      const vencimento = t.vencimentoProgramado!.toISOString().slice(0, 10);
      return { id: t.id, numTit: t.numTit, fornecedorNome: t.fornecedorNome ?? `código ${t.codFor}`, valorAberto: t.valorAberto, vencimento, dias: diasAte(vencimento, hoje) };
    })
    .filter((t) => !vencimentoSentinela(t.vencimento) && t.dias <= ANTECEDENCIA_DIAS);

  const alertas: Alertas = {
    geradoEm: new Date().toISOString(),
    notasNovas: notasNovas.sort((a, b) => (b.emissao ?? "").localeCompare(a.emissao ?? "")),
    notasVencidas: naoLancadas.filter((n) => n.dias < 0).sort(porVenc),
    notasVencendo: naoLancadas.filter((n) => n.dias >= 0).sort(porVenc),
    notasLancadas: candidatas.filter((n) => lancadas.has(n.chave)).sort(porVenc),
    titulosVencidos: titulosAlerta.filter((t) => t.dias < 0).sort(porVenc),
    titulosVencendo: titulosAlerta.filter((t) => t.dias >= 0).sort(porVenc),
    avisos,
  };
  cache = { em: Date.now(), alertas };
  return alertas;
}

/** Garante que a chave so' dispara uma vez (a chave primaria barra a segunda tentativa, mesmo concorrente). */
async function reservar(chaves: string[]): Promise<Set<string>> {
  const novas = new Set<string>();
  for (const chave of chaves) {
    try {
      await prisma.alertaFinanceiroEnviado.create({ data: { chave } });
      novas.add(chave);
    } catch {
      /* ja avisado */
    }
  }
  return novas;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Cria as notificacoes (sino) pra ADMIN/DIRETOR: NF novas (1 aviso por lote) e resumos diarios de vencimento. */
export async function notificarAlertas(a: Alertas): Promise<number> {
  const hoje = hojeBR();
  const avisos: { title: string; body: string }[] = [];

  const reservadas = await reservar(a.notasNovas.map((n) => `NFNOVA|${n.chave}`));
  const novas = a.notasNovas.filter((n) => reservadas.has(`NFNOVA|${n.chave}`));
  if (novas.length) {
    avisos.push({
      title: `${novas.length} nota(s) fiscal(is) nova(s) recebida(s)`,
      body: novas.slice(0, 5).map((n) => `NF ${n.numero} — ${n.emitente} (${moeda(n.valor)})`).join("\n") + (novas.length > 5 ? `\n… e mais ${novas.length - 5}` : ""),
    });
  }

  const resumo = async (tipo: string, titulo: string, valores: number[]) => {
    if (!valores.length || !(await reservar([`${tipo}|${hoje}`])).size) return;
    avisos.push({ title: `${valores.length} ${titulo}`, body: `Total ${moeda(valores.reduce((s, v) => s + v, 0))}` });
  };
  await resumo("NF_VENCIDA", "nota(s) fiscal(is) VENCIDA(S) ainda não lançada(s) na Senior", a.notasVencidas.map((n) => n.valor));
  await resumo("NF_VENCENDO", `nota(s) fiscal(is) vencendo em até ${ANTECEDENCIA_DIAS} dias, não lançada(s) na Senior`, a.notasVencendo.map((n) => n.valor));
  await resumo("TIT_VENCIDO", "título(s) a pagar VENCIDO(S)", a.titulosVencidos.map((t) => t.valorAberto));
  await resumo("TIT_VENCENDO", `título(s) a pagar vencendo em até ${ANTECEDENCIA_DIAS} dias`, a.titulosVencendo.map((t) => t.valorAberto));

  if (!avisos.length) return 0;
  const destinatarios = await prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "DIRETOR"] } }, select: { id: true } });
  await prisma.notification.createMany({
    data: destinatarios.flatMap((u) => avisos.map((v) => ({ userId: u.id, type: "OUTRO" as const, title: v.title, body: v.body, link: "/alertas-financeiro" }))),
  });
  return avisos.length;
}
