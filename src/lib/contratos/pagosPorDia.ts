// "Pagos / semana" (pedido do Joao, 03/11/2026): tabela abaixo do "Ao vivo" com o que foi PAGO nos dias escolhidos do mes, titulo a titulo e centro de custo a
// centro de custo, no lugar do relatorio semanal que a Cris recebia. Esta parte e' PURA (sem banco): recebe os pagamentos ja montados e devolve linhas, totais e o
// resumo por dia. A leitura do banco esta em pagosPorDiaServidor.ts.
//
// Regras:
//   - UMA LINHA = uma linha de rateio do pagamento (centro de custo x conta), como no Rel114 do Senior. `valor` e' so' a parte DAQUELA linha, do centro olhado: e' ele que soma nos totais.
//   - Os rateios de todos os centros do mesmo pagamento ficam em `rateios` (como na OC), com o da linha marcado em `desta`, e `totalPago` e' a soma deles.
//   - Quatro situacoes, da mais firme para a mais fraca (os totais ficam separados, nunca somados como se fossem a mesma coisa):
//       "pago"          = baixa lancada no Senior (data = data da baixa);
//       "pago_banco"    = o RETORNO do Itau confirmou o pagamento (data = data efetiva), mas o titulo continua em aberto no Senior: falta a baixa/conciliacao;
//       "enviado_banco" = o titulo esta numa remessa GERADA (ou agendado pelo banco) e ainda nao ha retorno: provavelmente pago, sem confirmacao;
//       "programado"    = so' estava programado para o dia (sem remessa): o pagamento pode ter sido feito por fora, o sistema nao tem como saber.
//     Remessa rejeitada ou cancelada nao e' pagamento: o titulo sai da tabela.

export type SituacaoPago = "pago" | "pago_banco" | "enviado_banco" | "programado";
export const SITUACOES_PAGO: SituacaoPago[] = ["pago", "pago_banco", "enviado_banco", "programado"];
export type FormaBaixa = "pagamento" | "adiantamento";

export type ParteDoPagamento = { ccu: string; conta: string; valor: number };
/** O que o sistema sabe da remessa/retorno do Itau para o titulo: status do item, data, valor efetivo e como ficou a baixa no Senior. */
export type EvidenciaBanco = { status: string; data: string | null; remessaEm: string | null; valorEfetivado: number | null; baixaSenior: string | null; baixaSeniorMsg: string | null };
export type Pagamento = {
  chave: string;
  situacao: SituacaoPago;
  forma: FormaBaixa | null;
  data: string; // aaaa-mm-dd: dia da baixa (pago), data efetiva do retorno (pago_banco), data da remessa (enviado_banco) ou vencimento programado (programado)
  numTit: string;
  tipo: string | null;
  codFor: string;
  fornecedor: string;
  vencimento: string | null;
  partes: ParteDoPagamento[];
  numOcp: string | null;
  remessa: EvidenciaBanco | null;
};

export type Aprovacao = { nivel: number; nome: string; data: string | null; situacao: string };
export type OcDoPagamento = { rotulo: string; situacao: string | null; aprovacoes: Aprovacao[] };

export type RateioDaLinha = { ccu: string; ccuNome: string; conta: string; valor: number; percentual: number; desta: boolean };
export type LinhaPago = {
  chave: string;
  situacao: SituacaoPago;
  forma: FormaBaixa | null;
  data: string;
  numTit: string;
  tipo: string | null;
  codFor: string;
  fornecedor: string;
  vencimento: string | null;
  conta: string;
  ccu: string;
  ccuNome: string;
  valor: number;
  totalPago: number;
  percentual: number;
  rateios: RateioDaLinha[];
  numOcp: string | null;
  ocRotulo: string;
  ocSituacao: string | null;
  aprovacoes: Aprovacao[];
  remessa: EvidenciaBanco | null;
};

// o filtro vale so' para o que esta CONFIRMADO como pago; o que nao tem confirmacao fica a parte, sempre (bloco recolhido da tela)
export type FiltroSituacaoPago = "todos" | "pago" | "pago_banco";
export const FILTROS_SITUACAO_PAGO: FiltroSituacaoPago[] = ["todos", "pago", "pago_banco"];
export const ehConfirmado = (s: SituacaoPago) => s === "pago" || s === "pago_banco";
export type ResumoDia = { dia: number; pagamentos: number; semBaixa: number; valor: number };
export type SomaPagos = { linhas: number; pagamentos: number; valor: number };
export type ResumoPagos = {
  porSituacao: Record<SituacaoPago, SomaPagos>;
  pagos: SomaPagos; // pago no Senior + pago pelo banco: e' o TOTAL PAGO da tela
  semConfirmacao: SomaPagos; // enviado ao banco sem retorno + so' programado: nunca entra no total pago
  porCentro: { ccu: string; nome: string; linhas: number; valor: number }[]; // so' do que esta pago
};

export const arred = (n: number) => Math.round(n * 100) / 100;

/** Quantos dias tem o mes "aaaa-mm". */
export function diasNoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * Le "1,5,9-12" e devolve os dias do mes, ordenados e sem repeticao. Vazio = nenhum filtro (o mes todo). Devolve `erro` quando alguma parte nao e'
 * um dia valido do mes (nao ignora em silencio: quem filtra precisa saber que o filtro nao foi entendido).
 */
export function lerDias(texto: string | null | undefined, mes: string): { dias: number[]; erro: string | null } {
  const bruto = (texto ?? "").trim();
  if (!bruto) return { dias: [], erro: null };
  const max = diasNoMes(mes);
  const dias = new Set<number>();
  for (const parte of bruto.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/.exec(parte);
    if (!m) return { dias: [], erro: `Dia inválido: "${parte}"` };
    const de = Number(m[1]);
    const ate = m[2] ? Number(m[2]) : de;
    if (de < 1 || ate > max || ate < de) return { dias: [], erro: `Dia fora do mês (1 a ${max}): "${parte}"` };
    for (let d = de; d <= ate; d++) dias.add(d);
  }
  return { dias: Array.from(dias).sort((a, b) => a - b), erro: null };
}

const diaDe = (iso: string) => Number(iso.slice(8, 10));

export type EntradaMontagem = {
  mes: string; // aaaa-mm
  dias: number[]; // vazio = o mes todo
  ccu?: string | null; // um centro de custo so'
  situacao?: FiltroSituacaoPago;
  q?: string | null;
  pode: (ccu: string) => boolean; // centros de custo que a pessoa ve: so' neles nascem linhas
  nomeDoCentro: (ccu: string) => string;
  ocDe: (numOcp: string) => OcDoPagamento | null;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Monta as linhas visiveis, o resumo por dia do mes inteiro (para a grade de dias) e os totais do filtro.
 * `linhas` = so' o que esta PAGO (baixa no Senior ou pagamento confirmado pelo retorno do banco). `semConfirmacao` = titulos programados ou enviados
 * ao banco sem retorno e ainda abertos no Senior: aparecem a parte e nunca somam no total pago.
 */
export function montarPagos(pagamentos: Pagamento[], e: EntradaMontagem): { linhas: LinhaPago[]; semConfirmacao: LinhaPago[]; dias: ResumoDia[]; resumo: ResumoPagos } {
  const doMes = pagamentos.filter((p) => p.data.slice(0, 7) === e.mes);
  const mostra = (ccu: string) => e.pode(ccu) && (!e.ccu || ccu === e.ccu);
  const visiveis = (p: Pagamento) => p.partes.some((x) => mostra(x.ccu));

  // grade de dias: independe do filtro de dias, de situacao e da busca (para a pessoa ver onde ha pagamento)
  const porDia = new Map<number, ResumoDia>();
  for (let d = 1; d <= diasNoMes(e.mes); d++) porDia.set(d, { dia: d, pagamentos: 0, semBaixa: 0, valor: 0 });
  for (const p of doMes) {
    if (!visiveis(p)) continue;
    const r = porDia.get(diaDe(p.data)) as ResumoDia;
    if (!ehConfirmado(p.situacao)) { r.semBaixa += 1; continue; }
    r.pagamentos += 1;
    for (const x of p.partes) if (mostra(x.ccu)) r.valor += x.valor;
  }
  const dias = Array.from(porDia.values()).map((d) => ({ ...d, valor: arred(d.valor) }));

  const q = e.q ? semAcento(e.q.trim()) : "";
  const situacao = e.situacao ?? "todos";
  const linhas: LinhaPago[] = [];
  const semConfirmacao: LinhaPago[] = [];
  for (const p of doMes) {
    if (e.dias.length > 0 && !e.dias.includes(diaDe(p.data))) continue;
    const confirmado = ehConfirmado(p.situacao);
    if (confirmado && situacao !== "todos" && p.situacao !== situacao) continue;
    const oc = p.numOcp ? e.ocDe(p.numOcp) : null;
    const total = arred(p.partes.reduce((s, x) => s + x.valor, 0));
    for (const [i, parte] of p.partes.entries()) {
      if (!mostra(parte.ccu)) continue;
      const linha: LinhaPago = {
        chave: `${p.chave}|${parte.ccu}|${parte.conta}|${i}`, // uma linha por linha de rateio do Senior (o mesmo centro e a mesma conta podem ter duas, como no Rel114)
        situacao: p.situacao, forma: p.forma, data: p.data, numTit: p.numTit, tipo: p.tipo, codFor: p.codFor, fornecedor: p.fornecedor, vencimento: p.vencimento,
        conta: parte.conta, ccu: parte.ccu, ccuNome: e.nomeDoCentro(parte.ccu), valor: parte.valor, totalPago: total,
        percentual: total > 0 ? parte.valor / total : 0,
        rateios: p.partes
          .map((x) => ({ ccu: x.ccu, ccuNome: e.nomeDoCentro(x.ccu), conta: x.conta, valor: x.valor, percentual: total > 0 ? x.valor / total : 0, desta: x === parte }))
          .sort((a, b) => Number(b.desta) - Number(a.desta) || b.valor - a.valor),
        numOcp: p.numOcp, ocRotulo: p.numOcp ? oc?.rotulo ?? "OC" : "Sem OC", ocSituacao: oc?.situacao ?? null, aprovacoes: oc?.aprovacoes ?? [], remessa: p.remessa,
      };
      if (q) {
        const alvo = semAcento([linha.fornecedor, linha.numTit, linha.numOcp ?? "", linha.conta, linha.ccuNome, linha.ccu].join(" "));
        if (!alvo.includes(q)) continue;
      }
      (confirmado ? linhas : semConfirmacao).push(linha);
    }
  }
  const ordem = (a: LinhaPago, b: LinhaPago) => a.data.localeCompare(b.data) || a.fornecedor.localeCompare(b.fornecedor, "pt-BR") || a.numTit.localeCompare(b.numTit) || a.ccuNome.localeCompare(b.ccuNome, "pt-BR");
  linhas.sort(ordem);
  semConfirmacao.sort(ordem);
  return { linhas, semConfirmacao, dias, resumo: resumir(linhas, semConfirmacao) };
}

export function resumir(linhas: LinhaPago[], semConfirmacao: LinhaPago[] = []): ResumoPagos {
  const soma = (l: LinhaPago[]): SomaPagos => ({ linhas: l.length, pagamentos: new Set(l.map((x) => x.chave.split("|").slice(0, 4).join("|"))).size, valor: arred(l.reduce((s, x) => s + x.valor, 0)) });
  const todas = [...linhas, ...semConfirmacao];
  const centros = new Map<string, { ccu: string; nome: string; linhas: number; valor: number }>();
  for (const l of linhas) {
    const c = centros.get(l.ccu) ?? { ccu: l.ccu, nome: l.ccuNome, linhas: 0, valor: 0 };
    c.linhas += 1;
    c.valor += l.valor;
    centros.set(l.ccu, c);
  }
  return {
    porSituacao: Object.fromEntries(SITUACOES_PAGO.map((s) => [s, soma(todas.filter((l) => l.situacao === s))])) as Record<SituacaoPago, SomaPagos>,
    pagos: soma(linhas),
    semConfirmacao: soma(semConfirmacao),
    porCentro: Array.from(centros.values()).map((c) => ({ ...c, valor: arred(c.valor) })).sort((a, b) => b.valor - a.valor),
  };
}

/** Aprovacoes da OC a partir do historico gravado na sincronizacao (E614USU): uma por nivel e aprovador, em ordem de nivel e data. */
export function aprovacoesDoHistorico(historico: string | null | undefined, nomeDe: (cod: string) => string): Aprovacao[] {
  if (!historico) return [];
  let lista: unknown;
  try { lista = JSON.parse(historico); } catch { return []; }
  if (!Array.isArray(lista)) return [];
  const unicas = new Map<string, Aprovacao>();
  for (const x of lista as Record<string, string>[]) {
    const nivel = Number(x?.NIVAPR);
    const cod = String(x?.USUAPR ?? "").trim();
    if (!Number.isFinite(nivel) || !cod) continue;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(x?.DATAPR ?? ""));
    const data = m && m[3] > "1901" ? `${m[3]}-${m[2]}-${m[1]}` : null;
    const k = `${nivel}|${cod}`;
    const antes = unicas.get(k);
    if (!antes || (data && (!antes.data || data < antes.data))) unicas.set(k, { nivel, nome: nomeDe(cod), data, situacao: String(x?.SITAPR ?? "") });
  }
  return Array.from(unicas.values()).sort((a, b) => a.nivel - b.nivel || (a.data ?? "").localeCompare(b.data ?? "") || a.nome.localeCompare(b.nome, "pt-BR"));
}
