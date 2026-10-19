// "Ao vivo": todos os lancamentos do Senior ligados a um centro de custo, para o coordenador acompanhar -- cada titulo (com OC ou sem, pago ou
// nao) e cada ordem de compra que ainda nao virou titulo (em analise, aprovada ou reprovada). Somente leitura; nada e' estimado:
// o status vem do Senior (titulo pago/em aberto/vencido/previsao; OC em analise/aprovada/reprovada).

import { situacaoLabel } from "@/lib/vinculoOcTitulo";
import type { TituloComCentro } from "./titulosPrevistos";

export type SituacaoPagamento = "pago" | "a_pagar" | "vencido" | "previsao" | "sem_titulo";
export type FiltroSituacao = "todas" | "pagos" | "a_pagar" | "vencidos" | "previsoes" | "oc_analise" | "oc_aprovada" | "oc_reprovada";
export const FILTROS_SITUACAO: { chave: FiltroSituacao; rotulo: string }[] = [
  { chave: "todas", rotulo: "Tudo" },
  { chave: "pagos", rotulo: "Pagos" },
  { chave: "a_pagar", rotulo: "A pagar" },
  { chave: "vencidos", rotulo: "Vencidos" },
  { chave: "previsoes", rotulo: "Previsões" },
  { chave: "oc_analise", rotulo: "OC em análise" },
  { chave: "oc_aprovada", rotulo: "OC aprovada, sem título ligado" },
  { chave: "oc_reprovada", rotulo: "OC reprovada ou cancelada" },
];

export type ItemAoVivo = {
  chave: string;
  origem: "TITULO" | "OC";
  ccu: string;
  ctaFin: string | null;
  linhaCusto: string | null;
  data: string; // evento mais recente (pagamento, lancamento ou emissao da OC)
  numTit: string | null;
  tipoTitulo: string | null;
  fornecedor: string;
  descricao: string | null;
  numOcp: string | null;
  ocSituacao: string | null;
  ocRotulo: string; // "Aprovada", "Em análise", "Sem OC"...
  pagamento: SituacaoPagamento;
  dataPagamento: string | null;
  vencimento: string | null;
  valor: number;
  origemCcu: string | null;
};

// Mesma regra da Programacao de Pagamento: datas-sentinela do Senior nao sao vencimentos reais.
export function vencimentoSentinelaPuro(dia: string) {
  const [ano, mes, d] = dia.split("-").map(Number);
  return ano <= 1950 || (ano >= 2030 && mes === 12 && d >= 28);
}

export function itemDoTitulo(t: TituloComCentro, hoje: string, nomeLinha: (cod: string) => string | null): ItemAoVivo {
  const venc = t.vencimento && !vencimentoSentinelaPuro(t.vencimento) ? t.vencimento : null;
  const pagamento: SituacaoPagamento = t.pago ? "pago" : t.tipo === "PRV" ? "previsao" : venc && venc < hoje ? "vencido" : "a_pagar";
  const ocRotulo = t.ocSituacao ? situacaoLabel(t.ocSituacao).replace(" (pendente)", "") : "Sem OC";
  return {
    chave: `T|${t.id}|${t.ccu}|${t.ctaFin ?? ""}`,
    origem: "TITULO",
    ccu: t.ccu as string,
    ctaFin: t.ctaFin,
    linhaCusto: t.ctaFin ? nomeLinha(t.ctaFin) ?? `Conta ${t.ctaFin}` : null,
    data: (t.pago ? t.dataPagamento : null) ?? t.dataLancamento ?? t.dataEmissao,
    numTit: t.numTit,
    tipoTitulo: t.tipo,
    fornecedor: t.fornecedorNome ?? `código ${t.codFor}`,
    descricao: t.descricao,
    numOcp: t.numOcpVinculada ?? t.numOcp,
    ocSituacao: t.ocSituacao,
    ocRotulo,
    pagamento,
    dataPagamento: t.dataPagamento,
    vencimento: venc,
    valor: t.pago ? t.valorOriginal : t.valorAberto,
    origemCcu: t.origemCcu,
  };
}

export type OcDoCentro = {
  numOcp: string;
  ccu: string;
  ctaFin: string | null;
  valor: number;
  situacaoAtual: string;
  dataEmissao: string;
  fornecedor: string;
  descricao: string | null;
  previsaoPagamento: string | null;
  pago?: boolean; // OC ja marcada como paga no Senior (sem o titulo ter sido achado)
};

export function itemDaOc(o: OcDoCentro, nomeLinha: (cod: string) => string | null): ItemAoVivo {
  return {
    chave: `O|${o.numOcp}|${o.ccu}|${o.ctaFin ?? ""}`,
    origem: "OC",
    ccu: o.ccu,
    ctaFin: o.ctaFin,
    linhaCusto: o.ctaFin ? nomeLinha(o.ctaFin) ?? `Conta ${o.ctaFin}` : null,
    data: o.dataEmissao,
    numTit: null,
    tipoTitulo: null,
    fornecedor: o.fornecedor,
    descricao: o.descricao,
    numOcp: o.numOcp,
    ocSituacao: o.situacaoAtual,
    ocRotulo: situacaoLabel(o.situacaoAtual).replace(" (pendente)", ""),
    pagamento: o.pago ? "pago" : "sem_titulo",
    dataPagamento: null,
    vencimento: o.previsaoPagamento,
    valor: o.valor,
    origemCcu: "oc",
  };
}

/** Valor do filtro de linha de custo para os lancamentos em que o Senior nao informa a linha. */
export const SEM_LINHA = "_sem_linha";

export type FiltrosAoVivo = { ccu?: string | null; conta?: string | null; situacao?: FiltroSituacao; q?: string | null; de?: string | null; ate?: string | null; mes?: string | null };

function bateSituacao(i: ItemAoVivo, s: FiltroSituacao): boolean {
  switch (s) {
    case "todas": return true;
    case "pagos": return i.pagamento === "pago";
    case "a_pagar": return i.pagamento === "a_pagar";
    case "vencidos": return i.pagamento === "vencido";
    case "previsoes": return i.pagamento === "previsao";
    case "oc_analise": return i.ocSituacao === "ANA" || i.ocSituacao === "PRE";
    case "oc_aprovada": return i.origem === "OC" && i.ocSituacao === "APR";
    case "oc_reprovada": return i.ocSituacao === "REP" || i.ocSituacao === "CAN";
  }
}

const normaliza = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function bateBusca(i: ItemAoVivo, q: string): boolean {
  if (!q) return true;
  const alvo = normaliza([i.fornecedor, i.descricao ?? "", i.numTit ?? "", i.numOcp ?? "", i.linhaCusto ?? ""].join(" "));
  return q.split(/\s+/).filter(Boolean).every((p) => alvo.includes(p));
}

export type MesAoVivo = { mes: string; n: number; valor: number; pagos: number; emAberto: number };

export type RespostaAoVivo = {
  total: number;
  pagina: number;
  paginas: number;
  itens: ItemAoVivo[];
  resumo: Record<FiltroSituacao, { n: number; valor: number }>;
  meses: MesAoVivo[]; // um por mes do periodo (mes do lancamento: pagamento, lancamento no Senior ou emissao da OC), com os demais filtros aplicados
  linhasDeCusto: { cod: string; nome: string; n: number; valor: number }[]; // com os demais filtros aplicados (menos o da propria linha)
};

const mesDe = (i: ItemAoVivo) => i.data.slice(0, 7);
function listaDeMeses(de: string, ate: string, maximo = 36): string[] {
  const l: string[] = [];
  let [a, m] = de.split("-").map(Number);
  while (`${a}-${String(m).padStart(2, "0")}` <= ate && l.length < maximo) {
    l.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return l;
}

export function montarAoVivo(todos: ReadonlyArray<ItemAoVivo>, f: FiltrosAoVivo, pagina = 1, tamanho = 60): RespostaAoVivo {
  const q = normaliza((f.q ?? "").trim());
  const situacao = f.situacao ?? "todas";
  const bateConta = (i: ItemAoVivo) => !f.conta || (f.conta === SEM_LINHA ? i.ctaFin === null : i.ctaFin === f.conta);
  const noPeriodo = (i: ItemAoVivo) => (!f.de || mesDe(i) >= f.de) && (!f.ate || mesDe(i) <= f.ate);
  const bateMes = (i: ItemAoVivo) => !f.mes || mesDe(i) === f.mes;
  const base = todos.filter((i) => (!f.ccu || i.ccu === f.ccu) && noPeriodo(i) && bateBusca(i, q));

  // mes a mes: ignora o proprio filtro de mes (mostra todos os meses do periodo), mas respeita linha de custo e situacao
  const nosMeses = base.filter((i) => bateConta(i) && bateSituacao(i, situacao));
  const porMes = new Map<string, MesAoVivo>();
  if (f.de && f.ate) for (const m of listaDeMeses(f.de, f.ate)) porMes.set(m, { mes: m, n: 0, valor: 0, pagos: 0, emAberto: 0 });
  for (const i of nosMeses) {
    const m = mesDe(i);
    const x = porMes.get(m) ?? { mes: m, n: 0, valor: 0, pagos: 0, emAberto: 0 };
    x.n += 1; x.valor += i.valor;
    if (i.pagamento === "pago") x.pagos += i.valor; else x.emAberto += i.valor;
    porMes.set(m, x);
  }
  const meses = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({ ...m, valor: Math.round(m.valor * 100) / 100, pagos: Math.round(m.pagos * 100) / 100, emAberto: Math.round(m.emAberto * 100) / 100 }));

  // resumo e linhas de custo: ignoram o proprio filtro (mostram quanto ha em cada opcao), mas respeitam o mes escolhido
  const noMes = base.filter(bateMes);
  const resumo = {} as RespostaAoVivo["resumo"];
  for (const { chave } of FILTROS_SITUACAO) {
    const l = noMes.filter((i) => bateConta(i) && bateSituacao(i, chave));
    resumo[chave] = { n: l.length, valor: Math.round(l.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
  }
  const porConta = new Map<string, { cod: string; nome: string; n: number; valor: number }>();
  for (const i of noMes) {
    if (!bateSituacao(i, situacao)) continue;
    const cod = i.ctaFin ?? SEM_LINHA;
    const atual = porConta.get(cod) ?? { cod, nome: i.linhaCusto ?? "Sem linha de custo informada", n: 0, valor: 0 };
    atual.n += 1;
    atual.valor += i.valor;
    porConta.set(cod, atual);
  }

  const filtrados = noMes.filter((i) => bateConta(i) && bateSituacao(i, situacao));
  filtrados.sort((a, b) => b.data.localeCompare(a.data) || a.chave.localeCompare(b.chave));
  const paginas = Math.max(1, Math.ceil(filtrados.length / tamanho));
  const p = Math.min(Math.max(1, pagina), paginas);
  return {
    total: filtrados.length,
    pagina: p,
    paginas,
    itens: filtrados.slice((p - 1) * tamanho, p * tamanho),
    resumo,
    meses,
    linhasDeCusto: [...porConta.values()].map((c) => ({ ...c, valor: Math.round(c.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
  };
}
