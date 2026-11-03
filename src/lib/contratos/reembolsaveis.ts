// "Despesas reembolsaveis" (pedido do Joao, 03/11/2026): a planilha que a Cristina preenche para os contratos com despesas reembolsaveis (RELATORIO DE DESPESAS
// REEMBOLSAVEIS: DOC., beneficiario, CPF/CNPJ do prestador, data de realizacao, TIPO DE SERVICO, valor, descricao e o RESUMO por tipo de servico), montada a partir
// do que o Senior ja tem. Esta parte e' PURA (sem banco): recebe as linhas pagas das contas reembolsaveis e devolve a planilha e o resumo.
//
// Regras:
//   - REGRA DO MES (descoberta conferindo a planilha de set/2026 da MRN 3687 LT nota a nota: 14 notas fecham ao centavo): entram as notas das contas reembolsaveis
//     (a antiga "Despesas Reembolsaveis" 67/179 e as "R - ...") cujo VENCIMENTO cai no mes, pagas ou ainda em aberto. A "data de realizacao" e' a emissao da nota. As notas
//     EMITIDAS no mes que so' vencem no mes seguinte ficam num grupo a parte (ex.: uma nota de 22/09 com vencimento 07/10 entrou na planilha de setembro).
//   - PARCELAS ANTIGAS: nota que vence no mes mas foi emitida ha mais de 90 dias (parcelas 07, 08, 11 de compras feitas meses antes) NAO esta na planilha da Cristina: das 7 notas assim
//     de set/2026 nenhuma entrou, e todas as notas do Senior que ela lancou foram emitidas ate 44 dias antes do vencimento. Ficam num grupo a parte, fora do total, e continuam visiveis.
//   - O valor de cada nota e' o rateio dela no centro de custo (o que a planilha usa); a Cristina divide a nota em itens e a soma dos itens fecha com ele.
//   - TIPO DE SERVICO e' uma das 11 opcoes da planilha. Nas contas "R - ..." vem da propria conta; na conta antiga (67), que e' uma so' para tudo, e' SUGERIDO pelo texto
//     da descricao e aparece marcado como sugerido; sem pista fica "Nao classificado". Nunca se inventa classificacao sem marcar.
//   - Nao calcula BDI nem tributos (so' a Cristina sabe quais itens sao do Meio Fisico); isso fica para ela, na planilha.

export const TIPOS_DE_SERVICO = [
  "Aluguel/hospedagem para execução de campo",
  "Hospedagem translados",
  "Deslocamento translados (táxi, uber, lancha, ônibus intermunicipais)",
  "Alimentação traslados",
  "Alimentação na execução dos serviços",
  "Aluguel de camionetes",
  "Aluguel de embarcações com abastecimento de combustível",
  "Passagens aéreas traslados de mobilização e desmobilização",
  "Combustível veículos (camionetes)",
  "Materias e petrechos de campo", // sic: e' como esta na lista da planilha da Cristina
  "Insumos veterinários",
] as const;
export type TipoDeServico = (typeof TIPOS_DE_SERVICO)[number];
export const NAO_CLASSIFICADO = "Não classificado" as const;
export type TipoOuNao = TipoDeServico | typeof NAO_CLASSIFICADO;
export type OrigemDoTipo = "conta" | "sugerido" | "nao_classificado";

const [ALUG_HOSP, HOSP_TRANSL, DESLOC, ALIM_TRANSL, ALIM_EXEC, CAMIONETES, EMBARCACOES, PASSAGENS, COMBUSTIVEL, MATERIAIS, VETERINARIOS] = TIPOS_DE_SERVICO;

/** Tipo de servico pelo codigo da conta "R - ..." do plano novo. Contas sem correspondencia na planilha ficam de fora (nao classificado). */
const TIPO_PELA_CONTA: Record<number, TipoDeServico> = {
  182: ALIM_EXEC, // R - Alimentacao para Contratos
  185: ALUG_HOSP, // R - Hospedagem para Contratos
  191: DESLOC, // R - Transporte para Contratos
  193: ALUG_HOSP, // R - Manutencao de Alojamento
  207: ALUG_HOSP, // R - Limpeza e Conservacao
  183: MATERIAIS, 184: MATERIAIS, 187: MATERIAIS, 188: MATERIAIS, 189: MATERIAIS, 190: MATERIAIS, // estacas, ferramentas, materiais de laboratorio/operacao/sondagem/topografia
  194: MATERIAIS, 195: MATERIAIS, 196: MATERIAIS, 197: MATERIAIS, // manutencao de equipamentos de campo
  200: MATERIAIS, 201: MATERIAIS, 202: MATERIAIS, // locacao de equipamentos de laboratorio/sondagem/topografia
  203: CAMIONETES, // R - Locacao Equipamentos Diversos (a planilha lanca locacao de radios em "Aluguel de camionetes")
  215: COMBUSTIVEL, 219: COMBUSTIVEL, // R - Combustivel, Lubrificantes
  218: CAMIONETES, 220: CAMIONETES, // R - Locacao de Veiculos, Manutencao de Veiculos
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Pistas no texto da descricao, na ordem de prioridade (a primeira que casar vale). So' sugere: quem confirma e' a Cristina. */
const PISTAS: [RegExp, TipoDeServico][] = [
  [/passagens? aere|aerea/, PASSAGENS],
  [/veterin|internac|hemograma|animal/, VETERINARIOS],
  [/locacao de onibus|aluguel de onibus/, CAMIONETES],
  [/hospedagem.*translad|translad.*hospedagem/, HOSP_TRANSL],
  [/alimenta.*translad|translad.*alimenta/, ALIM_TRANSL],
  [/hidroviari|taxi|uber|translad|onibus|passagens? rodoviari/, DESLOC],
  [/motosserra|motossera/, MATERIAIS], // gasolina e manutencao de motosserra vao em materiais de campo, nao em combustivel de veiculo
  [/lancha|embarca/, EMBARCACOES],
  [/combustivel|gasolina|diesel|etanol|abastecimento/, COMBUSTIVEL],
  [/camionete|caminhonete|veiculo|radio|telemetria|sensor|lavagem|lubrificacao|aluguel de carro/, CAMIONETES],
  [/refeic|jantar|jantas|almoco|marmit|alimenta|lanche|cafe da manha|recarga.*agua|agua de 20/, ALIM_EXEC],
  [/aluguel da casa|aluguel de casa|locacao de imovel|aluguel de imovel|compras? para (a )?casa|energia|ar condicionado|alojamento|hospedagem|material de limpeza|republica/, ALUG_HOSP],
  [/frete|gelo|ferramenta|tesoura|fita|papel|tinta|material|plastificacao|motosserra|funil|marcador|petrecho|abacaxi|sardinha|\bcones?\b|\bcompra de\b/, MATERIAIS],
];

/** Classifica uma linha: pela conta (R - ...), senao sugere pelo texto, senao "Nao classificado". `codConta` pode ser null (conta desconhecida). */
export function classificar(codConta: number | null, texto: string | null | undefined): { tipo: TipoOuNao; origem: OrigemDoTipo } {
  if (codConta !== null && TIPO_PELA_CONTA[codConta]) return { tipo: TIPO_PELA_CONTA[codConta], origem: "conta" };
  const t = semAcento(texto ?? "");
  if (t) for (const [re, tipo] of PISTAS) if (re.test(t)) return { tipo, origem: "sugerido" };
  return { tipo: NAO_CLASSIFICADO, origem: "nao_classificado" };
}

/** "VALOR BRUTO:R$ 125,30 - PAGAMENTO REFERENTE A COMPRA DE 05 CONES - EM ATENDIMENTO A CONTRATO - C/C: MRN" -> "Compra de 05 cones". */
export function limparDescricao(obs: string | null | undefined): string {
  let t = (obs ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.replace(/^valor bruto:?\s*r\$\s*[\d.,]+\s*-?\s*/i, "");
  t = t.replace(/^pagamento\s+(referente|ref\.?)\s+(a|ao|à)\s+/i, "");
  t = t.split(/\s+em atendimento\b|\s+-\s*c\/c\b|\s+c\/c:|\s+-\s*cc:|\s+-\s*data:|\s+-\s*periodo:|\s+periodo:/i)[0].replace(/[\s\-–.]+$/, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
}

/** CPF (11 digitos) ou CNPJ (14) formatado; qualquer outro tamanho volta como veio (so' digitos) ou null. */
export function formatarDocumento(doc: string | null | undefined): string | null {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d || null;
}

export const arred = (n: number) => Math.round(n * 100) / 100;

/** Uma linha PAGA de conta reembolsavel, como o servidor monta (linha de rateio da baixa + dados do titulo). */
export type EntradaReembolso = {
  ccu: string;
  conta: string; // nome da conta financeira (como no custo)
  codConta: number | null;
  numTit: string;
  tipoTitulo: string | null;
  codFor: string;
  fornecedor: string;
  documento: string | null; // CPF/CNPJ do prestador (so' digitos), quando o titulo traz
  valor: number; // so' a parte DESTE centro de custo
  dataPagamento: string | null; // aaaa-mm-dd; null = ainda em aberto
  vencimento: string; // aaaa-mm-dd: o que decide o mes da planilha
  pago: boolean;
  dataRealizacao: string | null; // aaaa-mm-dd: emissao do titulo/nota (a "DATA REALIZACAO" da planilha)
  descricao: string | null; // texto do titulo (OBSTCP)
};

export type LinhaReembolso = {
  chave: string;
  doc: number;
  ccu: string;
  ccuNome: string;
  numTit: string;
  tipoTitulo: string | null;
  fornecedor: string;
  cnpj: string | null;
  dataRealizacao: string | null;
  dataPagamento: string | null;
  vencimento: string;
  pago: boolean;
  tipo: TipoOuNao;
  origemTipo: OrigemDoTipo;
  conta: string;
  valor: number;
  descricao: string;
};

export type ResumoReembolso = {
  total: number;
  linhas: number;
  porTipo: { tipo: TipoOuNao; linhas: number; valor: number; sugeridas: number }[]; // os 11 tipos da planilha (mesmo sem lancamento) e "Nao classificado" quando houver
};

export type EntradaMontagemReembolso = {
  mes: string; // aaaa-mm (mes do VENCIMENTO da nota)
  ccu?: string | null;
  tipo?: string | null; // um tipo de servico so'
  q?: string | null;
  pode: (ccu: string) => boolean;
  nomeDoCentro: (ccu: string) => string;
};

/** Acima disto, entre a emissao e o vencimento, a nota e' parcela de uma compra antiga (inferido da planilha de set/2026: ver o cabecalho). */
export const DIAS_PARCELA_ANTIGA = 90;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

/** aaaa-mm do mes seguinte. */
export const proximoMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/**
 * Monta a planilha (linhas numeradas em DOC.) e o resumo por tipo de servico, so' com os centros que a pessoa ve. `linhas` = notas com vencimento no mes;
 * `antigas` = vencem no mes mas foram emitidas ha mais de 90 dias e `emitidas` = notas emitidas no mes que vencem no mes seguinte (os dois grupos ficam fora do total).
 */
export function montarReembolsaveis(entradas: EntradaReembolso[], e: EntradaMontagemReembolso): { linhas: LinhaReembolso[]; antigas: LinhaReembolso[]; emitidas: LinhaReembolso[]; resumo: ResumoReembolso } {
  const q = e.q ? semAcento(e.q) : "";
  const seguinte = proximoMes(e.mes);
  const principais: Omit<LinhaReembolso, "doc">[] = [];
  const depois: Omit<LinhaReembolso, "doc">[] = [];
  const antigas: Omit<LinhaReembolso, "doc">[] = [];
  for (const x of entradas) {
    if (!e.pode(x.ccu) || (e.ccu && x.ccu !== e.ccu)) continue;
    const noMes = x.vencimento.slice(0, 7) === e.mes;
    const emitidaNoMes = !noMes && x.dataRealizacao?.slice(0, 7) === e.mes && x.vencimento.slice(0, 7) === seguinte;
    if (!noMes && !emitidaNoMes) continue;
    const { tipo, origem } = classificar(x.codConta, `${limparDescricao(x.descricao)} ${x.descricao ?? ""}`);
    if (e.tipo && tipo !== e.tipo) continue;
    const descricao = limparDescricao(x.descricao) || x.conta;
    const l = {
      chave: `${x.numTit}|${x.codFor}|${x.tipoTitulo ?? ""}|${x.vencimento}|${x.ccu}|${x.conta}`, ccu: x.ccu, ccuNome: e.nomeDoCentro(x.ccu), numTit: x.numTit, tipoTitulo: x.tipoTitulo, fornecedor: x.fornecedor,
      cnpj: formatarDocumento(x.documento), dataRealizacao: x.dataRealizacao, dataPagamento: x.dataPagamento, vencimento: x.vencimento, pago: x.pago, tipo, origemTipo: origem, conta: x.conta, valor: arred(x.valor), descricao,
    };
    if (q && !semAcento([l.fornecedor, l.numTit, l.descricao, l.tipo, l.conta, l.ccuNome, l.ccu, l.cnpj ?? ""].join(" ")).includes(q)) continue;
    const antiga = noMes && !!x.dataRealizacao && diasEntre(x.dataRealizacao, x.vencimento) > DIAS_PARCELA_ANTIGA;
    (antiga ? antigas : noMes ? principais : depois).push(l);
  }
  const ordem = (a: Omit<LinhaReembolso, "doc">, b: Omit<LinhaReembolso, "doc">) => (a.dataRealizacao ?? a.vencimento).localeCompare(b.dataRealizacao ?? b.vencimento) || a.fornecedor.localeCompare(b.fornecedor, "pt-BR") || a.numTit.localeCompare(b.numTit) || a.ccu.localeCompare(b.ccu) || a.valor - b.valor;
  principais.sort(ordem);
  antigas.sort(ordem);
  depois.sort(ordem);
  const linhas = principais.map((l, i) => ({ ...l, doc: i + 1 }));
  const numerar = (ls: Omit<LinhaReembolso, "doc">[]) => ls.map((l, i) => ({ ...l, doc: i + 1 }));
  return { linhas, antigas: numerar(antigas), emitidas: numerar(depois), resumo: resumirReembolsos(linhas) };
}

export function resumirReembolsos(linhas: LinhaReembolso[]): ResumoReembolso {
  const porTipo = new Map<TipoOuNao, { tipo: TipoOuNao; linhas: number; valor: number; sugeridas: number }>();
  for (const t of TIPOS_DE_SERVICO) porTipo.set(t, { tipo: t, linhas: 0, valor: 0, sugeridas: 0 });
  for (const l of linhas) {
    const p = porTipo.get(l.tipo) ?? { tipo: l.tipo, linhas: 0, valor: 0, sugeridas: 0 };
    p.linhas += 1;
    p.valor += l.valor;
    if (l.origemTipo === "sugerido") p.sugeridas += 1;
    porTipo.set(l.tipo, p);
  }
  const lista = Array.from(porTipo.values()).filter((p) => p.tipo !== NAO_CLASSIFICADO || p.linhas > 0).map((p) => ({ ...p, valor: arred(p.valor) }));
  return { total: arred(linhas.reduce((s, l) => s + l.valor, 0)), linhas: linhas.length, porTipo: lista };
}
