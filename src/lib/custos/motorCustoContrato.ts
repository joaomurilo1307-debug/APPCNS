// Motor do "Custo por Centro de Custo": recalcula o custo financeiro de cada centro de custo direto do Senior.
//
// REGRA DE CUSTO (versao 2, definida em 18/10/2026 depois de conferir 16 planilhas de coordenadores contra o Senior):
//   custo = SOMA(E501RAT.VLRRAT) das linhas de rateio de BAIXA que quita uma nota, ou seja, cuja propria transacao
//           (E501RAT.CODTNS) e'
//             90550 "Baixa Titulo por Pagamento"            -> forma PAGAMENTO
//             90558 "Baixa de Tit. CP por Adiantamento"     -> forma ADIANTAMENTO
//           agrupado por CCU + conta financeira + MESANO (mes do pagamento), sem as contas que ja entram em
//           Pessoal/Impostos (ver planoContas.ts).
//   Por que o 90558 conta: a nota foi quitada com um adiantamento ja dado ao fornecedor; sem ele o custo da nota some.
//   Por que o espelho (90555, "Baixa Tit.Adiantamento") NAO conta: e' o mesmo valor visto do lado do titulo de adiantamento
//   (tipo ADT). Em 2026 no Senior inteiro: 90558 = R$ 194.974,41 e 90555 = R$ 194.974,41 -- contar os dois dobraria.
//   O que NAO e' custo: 90500/90501 (entrada = nota lancada), 90503 (previsao), 90530 (adiantamento dado), 90553
//   (cancelamento), 90557 (credito por cancelamento).
//   A regra anterior (so' 90550, chave NUMTIT+CODFIL+CODFOR+SEQMOV no E501MCP) e esta dao EXATAMENTE o mesmo resultado para
//   90550 (conferido linha a linha nos 101 centros de custo: 9.335 linhas, 0 diferencas em contas de custo); esta nao
//   depende de juntar com o E501MCP, entao nao tem a colisao NFS x ADT (mesmo NUMTIT/FORNECEDOR/SEQMOV em tipos diferentes).
//
// Alem do custo pago, o motor guarda em cada linha a competenciaNota -- a COMPETENCIA da nota, usada na visao "Competencia"
// (a compra inteira no mes dela, mesmo com parcelas pagas depois). Ordem: (1) a competencia fiscal cadastrada pelo financeiro
// no titulo (E501TCP.USU_COMFIS, igual em todas as parcelas da compra); (2) na falta dela, o mes do rateio de ENTRADA do titulo.
// A visao padrao ("Data de pagamento") e' a que bate com a coluna DATA COMPETENCIA das planilhas dos coordenadores: la a
// competencia e' o mes do pagamento (3.143 de 3.144 linhas conferidas). Titulos ainda NAO pagos nao entram em nada.
//
// Este arquivo tem duas partes: calcularCusto() e' PURA (testavel sem Senior); buscarDadosSenior() e' o acesso ao Senior,
// recebe a funcao de consulta por parametro (em producao: consultarSenior, que serializa as chamadas -- o GetDBInfo penaliza
// consultas concorrentes) e SO' LE.

import { CONTAS_FORA_DO_CUSTO, contaConhecida, nomeConta, registrarConta } from "./planoContas";
import { centroReatribuido } from "./reatribuicoes";

export type LinhaSenior = Record<string, string>;
export type Consulta = (sql: string, timeoutMs?: number) => Promise<LinhaSenior[]>;
export type Progresso = (etapa: string, percentual: number) => void | Promise<void>;

export type FormaBaixa = "PAGAMENTO" | "ADIANTAMENTO";

/** Transacoes de baixa (E501RAT.CODTNS) que entram no custo. */
export const TRANSACOES_DE_CUSTO: Readonly<Record<string, FormaBaixa>> = { "90550": "PAGAMENTO", "90558": "ADIANTAMENTO" };
/** Transacoes de ENTRADA do titulo (nota lancada): definem a competencia da nota e o saldo a pagar. */
export const TRANSACOES_DE_ENTRADA: ReadonlySet<string> = new Set(["90500", "90501", "90505", "90517", "90522"]);

export type LinhaRateio = {
  numTit: string;
  codFil: string;
  codTpt: string; // tipo do titulo (NFS, NFC, ADT...): NUMTIT+FORNECEDOR+SEQMOV sozinhos colidem entre tipos
  codFor: string;
  seqMov: string;
  ctaFin: string;
  codCcu: string;
  vlrRat: string;
  mesAno: string; // dd/mm/aaaa (dia 01)
  codTns: string; // transacao do movimento a que este rateio pertence
};

/** Baixa (E501MCP) por chave de titulo+seq: data real do pagamento. */
export type Baixa = { tns: string; dataPagamento: string | null };

export type ItemCusto = {
  codccu: string;
  contaCodigo: string;
  contaFinanceira: string;
  competencia: string; // aaaa-mm-01 (mes do pagamento)
  valor: number;
};

export type LinhaDetalheCusto = {
  codccu: string;
  contaCodigo: string;
  contaFinanceira: string;
  competencia: string; // aaaa-mm-01 (mes do pagamento)
  numTit: string;
  codFil: string;
  codTpt: string;
  codFor: string;
  valorRateado: number;
  baixa: FormaBaixa;
  dataPagamento: string | null; // aaaa-mm-dd
  competenciaNota: string | null; // aaaa-mm-01 (mes de competencia da nota); null = nao achou a entrada
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

/** Chave de uma baixa/titulo: inclui o TIPO do titulo (NFS x ADT com o mesmo numero e fornecedor sao titulos diferentes). */
export function chaveBaixa(numTit: string, codFil: string, codTpt: string, codFor: string, seqMov: string) {
  return `${numTit}|${codFil}|${codTpt}|${codFor}|${seqMov}`;
}
const chaveTitulo = (r: Pick<LinhaRateio, "numTit" | "codFil" | "codTpt" | "codFor">) => `${r.numTit}|${r.codFil}|${r.codTpt}|${r.codFor}`;

function rotuloConta(cod: string) {
  return nomeConta(cod) ?? `(conta ${cod})`;
}

const arred = (v: number) => Math.round(v * 100) / 100;

export type Descartadas = { foraDaRegra: number; foraDoCusto: number; antesDoPiso: number; semMes: number; semDataPagamento: number };

/** PURA: aplica a regra de custo sobre o rateio ja carregado. */
export function calcularCusto(
  rateios: ReadonlyArray<LinhaRateio>,
  baixas: ReadonlyMap<string, Baixa>,
  piso: string = COMPETENCIA_PISO
): { itens: ItemCusto[]; detalhe: LinhaDetalheCusto[]; descartadas: Descartadas } {
  const soma = new Map<string, number>();
  const detalhe: LinhaDetalheCusto[] = [];
  const descartadas: Descartadas = { foraDaRegra: 0, foraDoCusto: 0, antesDoPiso: 0, semMes: 0, semDataPagamento: 0 };

  // ---- 1) entrada de cada titulo (nota lancada): competencia da nota, por titulo+CCU+conta e por titulo+CCU
  const entradaCc = new Map<string, string>();
  const entradaC = new Map<string, string>();
  for (const r of rateios) {
    if (!TRANSACOES_DE_ENTRADA.has(r.codTns)) continue;
    const mes = mesDaCompetencia(r.mesAno);
    if (!mes) continue;
    const k = `${chaveTitulo(r)}|${r.codCcu}|${r.ctaFin}`;
    const e = entradaCc.get(k);
    entradaCc.set(k, e && e < mes ? e : mes);
    const kc = `${chaveTitulo(r)}|${r.codCcu}`;
    const ec = entradaC.get(kc);
    if (!ec || mes < ec) entradaC.set(kc, mes);
  }

  // ---- 2) custo: rateio de baixa por pagamento ou adiantamento
  for (const r of rateios) {
    const forma = TRANSACOES_DE_CUSTO[r.codTns];
    if (!forma) {
      descartadas.foraDaRegra++;
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
    // excecao decidida pelo Joao (ver reatribuicoes.ts): o centro do CUSTO pode diferir do rateio do Senior; a competencia da nota continua olhando o rateio original
    const ccuDoCusto = centroReatribuido(r) ?? r.codCcu;
    const chave = `${ccuDoCusto}|${r.ctaFin}|${mes}`;
    soma.set(chave, (soma.get(chave) ?? 0) + valor);
    const baixa = baixas.get(chaveBaixa(r.numTit, r.codFil, r.codTpt, r.codFor, r.seqMov));
    if (!baixa?.dataPagamento) descartadas.semDataPagamento++;
    const mesNota = entradaCc.get(`${chaveTitulo(r)}|${r.codCcu}|${r.ctaFin}`) ?? entradaC.get(`${chaveTitulo(r)}|${r.codCcu}`) ?? null;
    detalhe.push({
      codccu: ccuDoCusto,
      contaCodigo: r.ctaFin,
      contaFinanceira: rotuloConta(r.ctaFin),
      competencia: `${mes}-01`,
      numTit: r.numTit,
      codFil: r.codFil,
      codTpt: r.codTpt,
      codFor: r.codFor,
      valorRateado: valor,
      baixa: forma,
      dataPagamento: baixa?.dataPagamento ?? null,
      competenciaNota: mesNota ? `${mesNota}-01` : null,
    });
  }

  const itens: ItemCusto[] = [];
  for (const [chave, valor] of soma) {
    const [codccu, contaCodigo, mes] = chave.split("|");
    itens.push({ codccu, contaCodigo, contaFinanceira: rotuloConta(contaCodigo), competencia: `${mes}-01`, valor: arred(valor) });
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
  baixas: Map<string, Baixa>;
  ccus: Map<string, string>; // codccu -> descricao no Senior (E044CCU)
};

/** Le do Senior tudo que a regra precisa: CCUs, datas das baixas e o rateio de cada CCU (um de cada vez). */
export async function buscarDadosSenior(consultar: Consulta, progresso: Progresso = () => {}): Promise<DadosSenior> {
  await progresso("Lendo os centros de custo do Senior", 2);
  const linhasCcu = await comRetentativa("centros de custo", () => consultar("SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP=1", 2 * MINUTO));
  const ccus = new Map<string, string>();
  for (const l of linhasCcu) if (l.CODCCU) ccus.set(l.CODCCU.trim(), (l.DESCCU ?? "").trim());
  if (ccus.size === 0) throw new Error("O Senior não devolveu nenhum centro de custo (E044CCU) — atualização abortada, nada foi alterado.");

  await progresso("Lendo as baixas (pagamentos e adiantamentos) do Senior — é a etapa mais demorada", 5);
  const mcp = await comRetentativa("baixas (E501MCP)", () =>
    consultar("SELECT NUMTIT, CODFIL, CODTPT, CODFOR, SEQMOV, CODTNS, DATPGT FROM E501MCP WHERE CODTNS IN ('90550','90558')", 6 * MINUTO)
  );
  if (mcp.length === 0) throw new Error("O Senior não devolveu nenhuma baixa (E501MCP) — atualização abortada, nada foi alterado.");
  const baixas = new Map<string, Baixa>();
  for (const m of mcp) baixas.set(chaveBaixa(m.NUMTIT, m.CODFIL, (m.CODTPT ?? "").trim(), m.CODFOR, m.SEQMOV), { tns: (m.CODTNS ?? "").trim(), dataPagamento: dataBrParaIso(m.DATPGT) });

  const lista = Array.from(ccus.keys()).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const rateios: LinhaRateio[] = [];
  for (let i = 0; i < lista.length; i++) {
    const ccu = lista[i];
    if (!/^\d+$/.test(ccu)) continue; // so' codigos numericos entram na consulta (evita montar SQL com texto livre)
    await progresso(`Lendo o rateio do centro de custo ${ccu} (${i + 1} de ${lista.length})`, 5 + Math.round(((i + 1) / lista.length) * 70));
    const linhas = await comRetentativa(`rateio do CCU ${ccu}`, () =>
      consultar(`SELECT NUMTIT, CODFIL, CODTPT, CODFOR, SEQMOV, CTAFIN, CODCCU, VLRRAT, MESANO, CODTNS FROM E501RAT WHERE CODCCU='${ccu}'`, 3 * MINUTO)
    );
    for (const l of linhas) {
      rateios.push({
        numTit: l.NUMTIT,
        codFil: l.CODFIL,
        codTpt: (l.CODTPT ?? "").trim(),
        codFor: l.CODFOR,
        seqMov: l.SEQMOV,
        ctaFin: (l.CTAFIN ?? "").trim(),
        codCcu: (l.CODCCU ?? ccu).trim(),
        vlrRat: l.VLRRAT,
        mesAno: l.MESANO,
        codTns: (l.CODTNS ?? "").trim(),
      });
    }
  }
  return { rateios, baixas, ccus };
}

/** Contas usadas no rateio que ainda nao estao na tabela estatica (plano novo do Senior): busca o nome ao vivo. */
export async function resolverContasNovas(consultar: Consulta, rateios: ReadonlyArray<Pick<LinhaRateio, "ctaFin">>): Promise<string[]> {
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

/**
 * Competencia fiscal (E501TCP.USU_COMFIS) de cada titulo dos fornecedores informados: chave NUMTIT|CODFIL|CODTPT|CODFOR ->
 * "aaaa-mm-01". Titulo sem a competencia cadastrada (ou com 31/12/1900) nao entra no mapa. So' le.
 */
export async function buscarCompetenciasFiscais(consultar: Consulta, fornecedores: ReadonlyArray<string>, progresso: Progresso = () => {}): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const codigos = Array.from(new Set(fornecedores.filter((f) => /^\d+$/.test(f))));
  const LOTE = 60;
  for (let i = 0; i < codigos.length; i += LOTE) {
    const lote = codigos.slice(i, i + LOTE);
    await progresso(`Lendo a competência de cada título (${Math.min(i + LOTE, codigos.length)}/${codigos.length} fornecedores)`, 76 + Math.round((i / Math.max(1, codigos.length)) * 4));
    const linhas = await comRetentativa("competência dos títulos (E501TCP)", () =>
      consultar(`SELECT NUMTIT, CODFIL, CODTPT, CODFOR, USU_COMFIS FROM E501TCP WHERE CODEMP=1 AND CODFOR IN (${lote.join(",")})`, 5 * MINUTO)
    );
    for (const l of linhas) {
      const iso = dataBrParaIso(l.USU_COMFIS);
      if (iso) mapa.set(`${l.NUMTIT}|${l.CODFIL}|${(l.CODTPT ?? "").trim()}|${l.CODFOR}`, `${iso.slice(0, 7)}-01`);
    }
  }
  return mapa;
}

/**
 * Janela de sanidade da competencia digitada no titulo, em meses ANTES do pagamento: no maximo 5 anos (financiamento de 36 parcelas,
 * contrato de aluguel de varios anos) e no maximo 1 mes DEPOIS (competencia do mes seguinte). Fora disso e' erro de digitacao
 * (achado em 18/10/2026: competencias 05/2006 e 08/2060) e vale o mes do rateio de entrada.
 */
export const COMPETENCIA_MAX_MESES_ANTES = 60;
export const COMPETENCIA_MAX_MESES_DEPOIS = 1;

const indiceMes = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));

/** Aplica a competencia fiscal do titulo (quando cadastrada e plausivel) por cima da competencia vinda do rateio de entrada. */
export function aplicarCompetenciasFiscais(detalhe: LinhaDetalheCusto[], fiscais: ReadonlyMap<string, string>): { aplicadas: number; rejeitadas: number } {
  let aplicadas = 0;
  let rejeitadas = 0;
  for (const d of detalhe) {
    const f = fiscais.get(`${d.numTit}|${d.codFil}|${d.codTpt}|${d.codFor}`);
    if (!f) continue;
    const antes = indiceMes(d.competencia) - indiceMes(f); // meses entre a competencia e o pagamento
    if (antes > COMPETENCIA_MAX_MESES_ANTES || antes < -COMPETENCIA_MAX_MESES_DEPOIS) {
      rejeitadas++;
      continue;
    }
    d.competenciaNota = f;
    aplicadas++;
  }
  return { aplicadas, rejeitadas };
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
