// Relatorio de despesas recorrentes, so' leitura. A fonte e' o Senior: as recorrencias ja sao lancadas la como
// titulos de previsao (CODTPT = PRV, transacao 90503), em series NOME_01, NOME_02... (descoberto em 16/10/2026).
// Aqui nada e' gravado: agrupa as previsoes por fornecedor e compara com o que de fato foi lancado (titulos nao-PRV).

export type TituloRec = {
  numTit: string;
  tipo: string;
  codFor: string;
  fornecedorNome: string | null;
  vencimento: string; // yyyy-mm-dd
  valor: number; // valorOriginal
};

export type MesRec = { mes: string; previsto: number; realizado: number };
export type GrupoRec = {
  chave: string;
  fornecedor: string;
  tipoValor: "FIXO" | "VARIAVEL" | "INDEFINIDO";
  baseTipoValor: "realizado" | "previsto";
  periodicidade: string;
  regraDia: string;
  meses: MesRec[]; // 3 meses atras .. 3 a frente
  proxima: { numTit: string; vencimento: string; valor: number } | null;
  previsoesAbertas: number;
  vencidasSemRealizado: number; // previsao vencida e nada lancado no mes: a conta pode nao ter chegado
  vencidasComRealizado: number; // previsao vencida, mas o mes ja teve lancamento real: previsao velha esquecida
};

const mesDe = (iso: string) => iso.slice(0, 7);
const dia = (iso: string) => Number(iso.slice(8, 10));
const soma = (l: number[]) => l.reduce((s, v) => s + v, 0);

export function somaMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "FORNECEDORES DIVERSOS" junta folha, impostos etc.; ali a serie (FOPAG, FGTS...) e' que identifica a despesa.
function chaveGrupo(t: TituloRec): { chave: string; nome: string } {
  const nome = t.fornecedorNome ?? `código ${t.codFor}`;
  if (/DIVERSOS/i.test(nome)) {
    const base = t.numTit.toUpperCase().replace(/[\s_]*\d+([\s_/]\d+)*$/, "").trim() || t.numTit.toUpperCase();
    return { chave: `${t.codFor}|${base}`, nome: `${base} (${nome})` };
  }
  return { chave: t.codFor, nome };
}

/** k-esimo dia util do mes (sabado/domingo fora; feriados nao sao considerados). */
function ordinalDiaUtil(iso: string): number | null {
  const [a, m, d] = iso.split("-").map(Number);
  const sem = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  if (sem === 0 || sem === 6) return null;
  let n = 0;
  for (let i = 1; i <= d; i++) {
    const w = new Date(Date.UTC(a, m - 1, i)).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

const indiceMes = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7));

/** Periodicidade pelos MESES com previsao (varias previsoes no mesmo mes contam uma vez e viram "vários por mês"). */
export function periodicidade(vencs: string[]): string {
  const datas = [...new Set(vencs)];
  const meses = [...new Set(datas.map(mesDe))].sort();
  if (meses.length < 2) return datas.length > 1 ? "Vários no mês" : datas.length ? "Única / sem série" : "—";
  const gaps = meses.slice(1).map((m, i) => indiceMes(m) - indiceMes(meses[i])).sort((x, y) => x - y);
  const mediana = gaps[Math.floor(gaps.length / 2)];
  const nome = mediana === 1 ? "Mensal" : mediana === 3 ? "Trimestral" : mediana === 6 ? "Semestral" : mediana === 12 ? "Anual" : `Irregular (~${mediana} meses)`;
  return datas.length > meses.length * 1.5 ? `${nome} (vários por mês)` : nome;
}

export function regraDoDia(vencs: string[]): string {
  const u = [...new Set(vencs)];
  if (u.length < 2) return u.length ? `dia ${dia(u[0])}` : "—";
  const dias = new Set(u.map(dia));
  if (dias.size === 1) return `dia ${[...dias][0]} (fixo)`;
  const ord = u.map(ordinalDiaUtil);
  if (ord.every((o) => o !== null) && new Set(ord).size === 1) return `${ord[0]}º dia útil`;
  const min = Math.min(...dias), max = Math.max(...dias);
  // ponytail: sem calendario de feriados; "dia util" so' quando o ordinal e' o mesmo em todos
  return `varia entre os dias ${min} e ${max}${ord.every((o) => o !== null) ? " (sempre dia útil)" : ""}`;
}

export function montarRecorrentes(titulos: TituloRec[], hoje: string): GrupoRec[] {
  const mesHoje = mesDe(hoje);
  const janela = [-3, -2, -1, 0, 1, 2, 3].map((n) => somaMeses(mesHoje, n));
  const grupos = new Map<string, { nome: string; prv: TituloRec[]; reais: TituloRec[] }>();
  for (const t of titulos) {
    if (t.tipo !== "PRV") continue;
    const g = chaveGrupo(t);
    if (!grupos.has(g.chave)) grupos.set(g.chave, { nome: g.nome, prv: [], reais: [] });
    grupos.get(g.chave)!.prv.push(t);
  }
  // Realizado = titulos reais do mesmo fornecedor. Fornecedor "diversos" tem varias series: o real nao se separa, entao so' o grupo principal recebe.
  for (const t of titulos) {
    if (t.tipo === "PRV") continue;
    const chave = grupos.has(t.codFor) ? t.codFor : null;
    if (chave) grupos.get(chave)!.reais.push(t);
  }

  const saida: GrupoRec[] = [];
  for (const [chave, g] of grupos) {
    const prvVenc = g.prv.map((t) => t.vencimento);
    const meses: MesRec[] = janela.map((mes) => ({
      mes,
      previsto: soma(g.prv.filter((t) => mesDe(t.vencimento) === mes).map((t) => t.valor)),
      realizado: soma(g.reais.filter((t) => mesDe(t.vencimento) === mes).map((t) => t.valor)),
    }));

    // fixo x variavel: soma mensal do realizado nos ultimos 6 meses; sem historico, usa os valores previstos.
    const mensais = new Map<string, number>();
    for (const t of g.reais) {
      const m = mesDe(t.vencimento);
      if (m >= somaMeses(mesHoje, -6) && m <= mesHoje) mensais.set(m, (mensais.get(m) ?? 0) + t.valor);
    }
    let tipoValor: GrupoRec["tipoValor"] = "INDEFINIDO";
    let base: GrupoRec["baseTipoValor"] = "realizado";
    let serie = [...mensais.values()];
    if (serie.length < 3) {
      base = "previsto";
      serie = g.prv.map((t) => t.valor);
    }
    if (serie.length >= 3 || (base === "previsto" && serie.length >= 2)) {
      const media = soma(serie) / serie.length;
      tipoValor = media > 0 && (Math.max(...serie) - Math.min(...serie)) / media <= 0.02 ? "FIXO" : "VARIAVEL";
    }

    const futuras = g.prv.filter((t) => t.vencimento >= hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const vencidas = g.prv.filter((t) => t.vencimento < hoje);
    const comReal = (t: TituloRec) => g.reais.some((r) => mesDe(r.vencimento) === mesDe(t.vencimento));
    saida.push({
      chave,
      fornecedor: g.nome,
      tipoValor,
      baseTipoValor: base,
      periodicidade: periodicidade(prvVenc),
      regraDia: regraDoDia(prvVenc),
      meses,
      proxima: futuras[0] ? { numTit: futuras[0].numTit, vencimento: futuras[0].vencimento, valor: futuras[0].valor } : null,
      previsoesAbertas: g.prv.length,
      vencidasSemRealizado: vencidas.filter((t) => !comReal(t)).length,
      vencidasComRealizado: vencidas.filter(comReal).length,
    });
  }
  return saida.sort((a, b) => (a.proxima?.vencimento ?? "9999").localeCompare(b.proxima?.vencimento ?? "9999") || a.fornecedor.localeCompare(b.fornecedor));
}
