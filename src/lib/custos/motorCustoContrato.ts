// Motor do "Custo por Contrato": recalcula o custo financeiro de cada centro de custo direto do Senior, pela MESMA regra
// validada ao centavo contra o Rel114 / Rito de Gestao (jan a ago/2026, conferido CCU a CCU em 17/10/2026):
//   custo = SOMA(E501RAT.VLRRAT) das linhas de rateio cuja chave (NUMTIT, CODFIL, CODFOR, SEQMOV) tem baixa REAL no
//           E501MCP (CODTNS = 90550), agrupado por CCU + conta financeira + MESANO (mes de competencia),
//           sem as contas que ja entram em Pessoal/Impostos (ver planoContas.ts).
// A chave de juncao TEM que incluir CODFOR (NUMTIT sozinho colide entre fornecedores -- achado do Rito, ~30% de inflacao).
//
// Este arquivo tem duas partes: calcularCusto() e' PURA (testavel sem Senior); buscarDadosSenior() e' o acesso ao Senior,
// recebe a funcao de consulta por parametro (em producao: consultarSenior, que serializa as chamadas -- o GetDBInfo penaliza
// consultas concorrentes) e SO' LE.

import { CONTAS_FORA_DO_CUSTO, contaConhecida, nomeConta, registrarConta } from "./planoContas";

export type LinhaSenior = Record<string, string>;
export type Consulta = (sql: string, timeoutMs?: number) => Promise<LinhaSenior[]>;
export type Progresso = (etapa: string, percentual: number) => void | Promise<void>;

export type LinhaRateio = {
  numTit: string;
  codFil: string;
  codFor: string;
  seqMov: string;
  ctaFin: string;
  codCcu: string;
  vlrRat: string;
  mesAno: string; // dd/mm/aaaa (dia 01)
};

export type ItemCusto = {
  codccu: string;
  contaCodigo: string;
  contaFinanceira: string;
  competencia: string; // aaaa-mm-01
  valor: number;
};

export type LinhaDetalheCusto = {
  codccu: string;
  contaCodigo: string;
  contaFinanceira: string;
  competencia: string;
  numTit: string;
  codFil: string;
  codFor: string;
  valorRateado: number;
};

/** Piso de competencia da tela (pedido do Joao 15/09/2026: so' de 2026 em diante, que e' onde o Rito confirma). */
export const COMPETENCIA_PISO = "2026-01";

export function numeroSenior(texto: string | undefined | null): number {
  if (texto === undefined || texto === null) return 0;
  const t = String(texto).trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** "01/09/2026" -> "2026-09"; qualquer outra coisa -> null. */
export function mesDaCompetencia(mesAno: string | undefined | null): string | null {
  if (!mesAno || !mesAno.includes("/")) return null;
  const partes = mesAno.trim().split("/");
  if (partes.length !== 3) return null;
  const [, mm, aaaa] = partes;
  if (!/^\d{2}$/.test(mm) || !/^\d{4}$/.test(aaaa)) return null;
  return `${aaaa}-${mm}`;
}

export function dataBrParaIso(texto: string | undefined | null): string | null {
  if (!texto) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  if (m[3] === "1900") return null; // placeholder de "sem data" do Senior (31/12/1900)
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function chaveBaixa(numTit: string, codFil: string, codFor: string, seqMov: string) {
  return `${numTit}|${codFil}|${codFor}|${seqMov}`;
}

function rotuloConta(cod: string) {
  return nomeConta(cod) ?? `(conta ${cod})`;
}

/** PURA: aplica a regra de custo sobre o rateio ja carregado. */
export function calcularCusto(
  rateios: ReadonlyArray<LinhaRateio>,
  baixas: ReadonlySet<string>,
  piso: string = COMPETENCIA_PISO
): { itens: ItemCusto[]; detalhe: LinhaDetalheCusto[]; descartadas: { semBaixa: number; foraDoCusto: number; antesDoPiso: number; semMes: number } } {
  const soma = new Map<string, number>();
  const detalhe: LinhaDetalheCusto[] = [];
  const descartadas = { semBaixa: 0, foraDoCusto: 0, antesDoPiso: 0, semMes: 0 };

  for (const r of rateios) {
    if (!baixas.has(chaveBaixa(r.numTit, r.codFil, r.codFor, r.seqMov))) {
      descartadas.semBaixa++;
      continue;
    }
    const mes = mesDaCompetencia(r.mesAno);
    if (!mes) {
      descartadas.semMes++;
      continue;
    }
    if (mes < piso) {
      descartadas.antesDoPiso++;
      continue;
    }
    if (CONTAS_FORA_DO_CUSTO.has(r.ctaFin)) {
      descartadas.foraDoCusto++;
      continue;
    }
    const valor = numeroSenior(r.vlrRat);
    const chave = `${r.codCcu}|${r.ctaFin}|${mes}`;
    soma.set(chave, (soma.get(chave) ?? 0) + valor);
    detalhe.push({
      codccu: r.codCcu,
      contaCodigo: r.ctaFin,
      contaFinanceira: rotuloConta(r.ctaFin),
      competencia: `${mes}-01`,
      numTit: r.numTit,
      codFil: r.codFil,
      codFor: r.codFor,
      valorRateado: valor,
    });
  }

  const itens: ItemCusto[] = [];
  for (const [chave, valor] of soma) {
    const [codccu, contaCodigo, mes] = chave.split("|");
    itens.push({ codccu, contaCodigo, contaFinanceira: rotuloConta(contaCodigo), competencia: `${mes}-01`, valor: Math.round(valor * 100) / 100 });
  }
  itens.sort((a, b) => a.codccu.localeCompare(b.codccu, "pt-BR", { numeric: true }) || a.competencia.localeCompare(b.competencia) || a.contaCodigo.localeCompare(b.contaCodigo, "pt-BR", { numeric: true }));
  return { itens, detalhe, descartadas };
}

// ---------------------------------------------------------------- acesso ao Senior (somente leitura)

const MINUTO = 60_000;

async function comRetentativa<T>(rotulo: string, fn: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (i < tentativas) await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
  throw new Error(`${rotulo}: ${ultimo instanceof Error ? ultimo.message : String(ultimo)}`);
}

export type DadosSenior = {
  rateios: LinhaRateio[];
  baixas: Set<string>;
  ccus: Map<string, string>; // codccu -> descricao no Senior (E044CCU)
};

/** Le do Senior tudo que a regra precisa: CCUs, baixas reais e o rateio de cada CCU (um de cada vez). */
export async function buscarDadosSenior(consultar: Consulta, progresso: Progresso = () => {}): Promise<DadosSenior> {
  await progresso("Lendo os centros de custo do Senior", 2);
  const linhasCcu = await comRetentativa("centros de custo", () => consultar("SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP=1", 2 * MINUTO));
  const ccus = new Map<string, string>();
  for (const l of linhasCcu) if (l.CODCCU) ccus.set(l.CODCCU.trim(), (l.DESCCU ?? "").trim());
  if (ccus.size === 0) throw new Error("O Senior não devolveu nenhum centro de custo (E044CCU) — atualização abortada, nada foi alterado.");

  await progresso("Lendo as baixas (pagamentos) do Senior — é a etapa mais demorada", 5);
  const mcp = await comRetentativa("baixas (E501MCP)", () => consultar("SELECT NUMTIT, CODFIL, CODFOR, SEQMOV FROM E501MCP WHERE CODTNS='90550'", 6 * MINUTO));
  if (mcp.length === 0) throw new Error("O Senior não devolveu nenhuma baixa (E501MCP) — atualização abortada, nada foi alterado.");
  const baixas = new Set<string>();
  for (const m of mcp) baixas.add(chaveBaixa(m.NUMTIT, m.CODFIL, m.CODFOR, m.SEQMOV));

  const lista = Array.from(ccus.keys()).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const rateios: LinhaRateio[] = [];
  for (let i = 0; i < lista.length; i++) {
    const ccu = lista[i];
    if (!/^\d+$/.test(ccu)) continue; // so' codigos numericos entram na consulta (evita montar SQL com texto livre)
    await progresso(`Lendo o rateio do centro de custo ${ccu} (${i + 1} de ${lista.length})`, 5 + Math.round(((i + 1) / lista.length) * 70));
    const linhas = await comRetentativa(`rateio do CCU ${ccu}`, () =>
      consultar(`SELECT NUMTIT, CODFIL, CODFOR, SEQMOV, CTAFIN, CODCCU, VLRRAT, MESANO FROM E501RAT WHERE CODCCU='${ccu}'`, 3 * MINUTO)
    );
    for (const l of linhas) {
      rateios.push({ numTit: l.NUMTIT, codFil: l.CODFIL, codFor: l.CODFOR, seqMov: l.SEQMOV, ctaFin: (l.CTAFIN ?? "").trim(), codCcu: (l.CODCCU ?? ccu).trim(), vlrRat: l.VLRRAT, mesAno: l.MESANO });
    }
  }
  return { rateios, baixas, ccus };
}

/** Contas usadas no rateio que ainda nao estao na tabela estatica (plano novo do Senior): busca o nome ao vivo. */
export async function resolverContasNovas(consultar: Consulta, rateios: ReadonlyArray<LinhaRateio>): Promise<string[]> {
  const desconhecidas = Array.from(new Set(rateios.map((r) => r.ctaFin).filter((c) => /^\d+$/.test(c) && !contaConhecida(c))));
  if (desconhecidas.length === 0) return [];
  const achadas: string[] = [];
  for (let i = 0; i < desconhecidas.length; i += 50) {
    const lote = desconhecidas.slice(i, i + 50);
    const linhas = await comRetentativa("plano de contas (E091PLF)", () =>
      consultar(`SELECT CTAFIN, DESCTA, CLAFIN, NIVFIN FROM E091PLF WHERE CODEMP=1 AND CTAFIN IN (${lote.join(",")})`, 3 * MINUTO)
    );
    for (const l of linhas) {
      const cod = Number(l.CTAFIN);
      if (!Number.isFinite(cod)) continue;
      registrarConta(cod, (l.DESCTA ?? "").trim().replace(/\s+/g, " ") || `(conta ${cod})`, (l.CLAFIN ?? "").trim(), Number(l.NIVFIN) || 0);
      achadas.push(String(cod));
    }
  }
  return achadas;
}

export type InfoTitulo = { fornecedorNome: string | null; dataEntrada: string | null; dataVencimento: string | null };

function aspas(valor: string) {
  return `'${valor.replace(/'/g, "''")}'`;
}

/**
 * Nome do fornecedor e datas de entrada/vencimento por titulo. `cache` traz o que ja foi lido antes (datas de um titulo
 * nao mudam); so' o que falta vai ao Senior, em lotes pequenos (IN grande estoura o tempo no GetDBInfo).
 */
export async function enriquecerTitulos(
  consultar: Consulta,
  titulos: ReadonlyArray<{ numTit: string; codFor: string }>,
  cache: ReadonlyMap<string, InfoTitulo>,
  progresso: Progresso = () => {}
): Promise<Map<string, InfoTitulo>> {
  const resultado = new Map<string, InfoTitulo>();
  const faltam = new Map<string, { numTit: string; codFor: string }>();
  for (const t of titulos) {
    const k = `${t.numTit}|${t.codFor}`;
    if (resultado.has(k) || faltam.has(k)) continue;
    const c = cache.get(k);
    if (c) resultado.set(k, c); // ja lido antes (mesmo sem data: nao repete a consulta a cada rodada)
    else faltam.set(k, t);
  }

  const pendentes = Array.from(faltam.values());
  const LOTE = 60;
  for (let i = 0; i < pendentes.length; i += LOTE) {
    const lote = pendentes.slice(i, i + LOTE);
    await progresso(`Lendo datas de ${pendentes.length} títulos novos (${Math.min(i + LOTE, pendentes.length)}/${pendentes.length})`, 80 + Math.round((i / pendentes.length) * 8));
    const numeros = Array.from(new Set(lote.map((t) => aspas(t.numTit)))).join(",");
    const fornecedores = Array.from(new Set(lote.map((t) => t.codFor))).filter((f) => /^\d+$/.test(f)).join(",");
    if (!fornecedores) continue;
    const linhas = await comRetentativa("datas dos títulos (E501TCP)", () =>
      consultar(`SELECT NUMTIT, CODFIL, CODFOR, DATENT, VCTORI FROM E501TCP WHERE CODEMP=1 AND NUMTIT IN (${numeros}) AND CODFOR IN (${fornecedores})`, 3 * MINUTO)
    );
    for (const l of linhas) {
      const k = `${l.NUMTIT}|${l.CODFOR}`;
      if (!faltam.has(k) || resultado.has(k)) continue;
      resultado.set(k, { fornecedorNome: cache.get(k)?.fornecedorNome ?? null, dataEntrada: dataBrParaIso(l.DATENT), dataVencimento: dataBrParaIso(l.VCTORI) });
    }
  }
  for (const t of pendentes) {
    const k = `${t.numTit}|${t.codFor}`;
    if (!resultado.has(k)) resultado.set(k, { fornecedorNome: cache.get(k)?.fornecedorNome ?? null, dataEntrada: null, dataVencimento: null });
  }

  // nomes de fornecedor: o que o cache ja sabe + o que falta, pelo cadastro (E095FOR)
  const nomePorFornecedor = new Map<string, string>();
  for (const [k, v] of cache) if (v.fornecedorNome) nomePorFornecedor.set(k.split("|")[1], v.fornecedorNome);
  const buscar = new Set<string>();
  for (const [k, v] of resultado) {
    if (v.fornecedorNome) continue;
    const cod = k.split("|")[1];
    if (nomePorFornecedor.has(cod)) continue;
    if (/^\d+$/.test(cod)) buscar.add(cod);
  }
  const codigos = Array.from(buscar);
  for (let i = 0; i < codigos.length; i += 100) {
    const lote = codigos.slice(i, i + 100);
    await progresso(`Lendo nomes de ${codigos.length} fornecedores novos`, 88);
    const linhas = await comRetentativa("fornecedores (E095FOR)", () => consultar(`SELECT CODFOR, NOMFOR FROM E095FOR WHERE CODFOR IN (${lote.join(",")})`, 3 * MINUTO));
    for (const l of linhas) if (l.CODFOR && l.NOMFOR) nomePorFornecedor.set(l.CODFOR.trim(), l.NOMFOR.trim());
  }
  for (const [k, v] of resultado) {
    if (!v.fornecedorNome) resultado.set(k, { ...v, fornecedorNome: nomePorFornecedor.get(k.split("|")[1]) ?? null });
  }
  return resultado;
}
