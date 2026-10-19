// Previsao por centro de custo (somente leitura). Tudo vem dos titulos EM ABERTO que o Senior ja tem para o CCU: nada e' cadastrado nem
// estimado aqui. A unica "inteligencia" e' agrupar cada titulo numa categoria; a regra e' simples e transparente:
//   1. fornecedor/descricao com palavra de veiculo (locadora, ...) -> Parcelas de veiculos
//   2. fornecedor/descricao com palavra de TI (notebook, Dell, ...) -> Parcelas de computadores e TI
//   3. tipo PRV (previsao lancada no Senior)                      -> Despesas recorrentes
//   4. tem OC (no titulo ou vinculada) ou NF de compra            -> Aquisicoes
//   5. o resto                                                    -> Demais titulos em aberto
// Titulo que nao casa com nenhuma palavra NAO e' forcado numa categoria: cai em "Demais" e fica visivel.

export type CategoriaPrevisao = "RECORRENTE" | "VEICULO" | "TI" | "AQUISICAO" | "OC_PROGRAMADA" | "DEMAIS";

export const CATEGORIAS: { chave: CategoriaPrevisao; rotulo: string; descricao: string }[] = [
  { chave: "RECORRENTE", rotulo: "Despesas recorrentes", descricao: "Previsões lançadas no Senior (tipo PRV) que não são de veículo nem de TI: aluguel, contratos mensais, serviços fixos." },
  { chave: "VEICULO", rotulo: "Parcelas de veículos", descricao: "Títulos em aberto cujo fornecedor ou descrição indica veículo, locação, financiamento ou frota." },
  { chave: "TI", rotulo: "Parcelas de computadores e TI", descricao: "Títulos em aberto cujo fornecedor ou descrição indica computador, notebook ou equipamento de TI." },
  { chave: "AQUISICAO", rotulo: "Aquisições", descricao: "Títulos em aberto de compras, com ordem de compra ou nota fiscal de compra vinculada." },
  { chave: "OC_PROGRAMADA", rotulo: "OCs programadas", descricao: "Ordens de compra em análise ou aprovadas que ainda não viraram título no Senior. A data é a previsão de pagamento informada na OC." },
  { chave: "DEMAIS", rotulo: "Demais títulos em aberto", descricao: "Títulos que não se encaixam nas categorias acima. Ficam aqui, sem forçar classificação." },
];

const VEICULO = /\b(ve[ií]culos?|carros?|autom[oó]ve(l|is)|caminh(ã|a)o|caminhonete|pick-?up|frota|locadora|locac(ao|ão) de ve[ií]culos?|localiza|movida|unidas|ipva|seguro auto|toyota|hilux|fiat|strada|volkswagen|chevrolet|renault|nissan|mitsubishi|hyundai)\b/i;
const TI = /\b(computador(es)?|notebooks?|laptops?|desktop|microcomputador(es)?|inform[aá]tica|workstation|dell|lenovo|acer|asus|macbook|equipamentos? de ti)\b/i;

export type TituloPrevisao = {
  numTit: string;
  tipo: string;
  fornecedorNome: string | null;
  descricao: string | null;
  numOcp: string | null;
  numNfc: string | null;
  vencimento: string; // yyyy-mm-dd (programado, ou o original); vazio = sem data (OC sem previsao de pagamento)
  valorAberto: number;
  origemCcu?: "rateio" | "titulo" | "oc" | "oc-rateada" | null; // de onde veio o CC: rateio do Senior, proprio titulo ou OC vinculada
  numOcpVinculada?: string | null;
  codFor?: string;
  ctaFin?: string | null; // linha de custo (conta financeira), quando o Senior informa
  contaNome?: string | null;
  valorTipo?: "FIXO" | "VARIAVEL" | null; // so' para previsoes recorrentes: o valor se repete igual na serie ou varia
};

export function categoriaDoTitulo(t: Pick<TituloPrevisao, "tipo" | "fornecedorNome" | "descricao" | "numOcp" | "numNfc"> & { numOcpVinculada?: string | null }): CategoriaPrevisao {
  if (t.tipo === "OC") return "OC_PROGRAMADA"; // ordem de compra que ainda nao virou titulo (linha criada a partir da OC)
  const texto = `${t.fornecedorNome ?? ""} ${t.descricao ?? ""}`;
  if (VEICULO.test(texto)) return "VEICULO";
  if (TI.test(texto)) return "TI";
  if (t.tipo === "PRV") return "RECORRENTE";
  if (t.numOcp || t.numNfc || t.numOcpVinculada) return "AQUISICAO";
  return "DEMAIS";
}

export const somaMeses = (mes: string, n: number): string => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Serie de uma previsao recorrente: o mesmo fornecedor e o mesmo "nome" de titulo sem o numero da parcela (COPASA_05 -> COPASA).
export const chaveDaSerie = (t: Pick<TituloPrevisao, "numTit" | "codFor" | "fornecedorNome">) => {
  const base = t.numTit.toUpperCase().replace(/[\s_]*\d+([\s_/]\d+)*$/, "").trim() || t.numTit.toUpperCase();
  return `${t.codFor ?? t.fornecedorNome ?? "?"}|${base}`;
};

/** Valor FIXO quando todas as previsoes da serie ficam dentro de 2% da media (mesma regra das Despesas recorrentes); VARIAVEL quando nao; sem tipo com uma so'. */
export function tiposDeValorDasSeries(recorrentes: ReadonlyArray<TituloPrevisao>): Map<string, "FIXO" | "VARIAVEL"> {
  const valores = new Map<string, number[]>();
  for (const t of recorrentes) {
    const k = chaveDaSerie(t);
    const l = valores.get(k);
    if (l) l.push(t.valorAberto);
    else valores.set(k, [t.valorAberto]);
  }
  const saida = new Map<string, "FIXO" | "VARIAVEL">();
  for (const [k, v] of valores) {
    if (v.length < 2) continue;
    const media = v.reduce((s, x) => s + x, 0) / v.length;
    saida.set(k, media > 0 && (Math.max(...v) - Math.min(...v)) / media <= 0.02 ? "FIXO" : "VARIAVEL");
  }
  return saida;
}

export type GrupoPrevisao = {
  chave: CategoriaPrevisao;
  rotulo: string;
  descricao: string;
  total: number;
  quantidade: number;
  vencidos: number; // valor com vencimento anterior a hoje (ainda em aberto)
  depois: number; // valor alem da janela de meses
  semData: number; // valor sem data de vencimento/previsao (so' OC sem previsao de pagamento)
  porMes: Record<string, number>; // chave yyyy-mm, so' dentro da janela
  porTipoValor: { FIXO: number; VARIAVEL: number; SEM_SERIE: number }; // so' faz sentido em Despesas recorrentes
  titulos: TituloPrevisao[]; // mais proximos primeiro
};

export const MESES_JANELA = 12;

export function montarPrevisao(titulos: TituloPrevisao[], hoje: string): { meses: string[]; grupos: GrupoPrevisao[]; total: number; quantidade: number } {
  const mesHoje = hoje.slice(0, 7);
  const meses = Array.from({ length: MESES_JANELA }, (_, i) => somaMeses(mesHoje, i));
  const grupos: GrupoPrevisao[] = CATEGORIAS.map((c) => ({ ...c, total: 0, quantidade: 0, vencidos: 0, depois: 0, semData: 0, porMes: Object.fromEntries(meses.map((m) => [m, 0])), porTipoValor: { FIXO: 0, VARIAVEL: 0, SEM_SERIE: 0 }, titulos: [] }));
  const tipoDaSerie = tiposDeValorDasSeries(titulos.filter((t) => categoriaDoTitulo(t) === "RECORRENTE"));
  const porChave = new Map(grupos.map((g) => [g.chave, g]));
  for (const t of titulos) {
    const cat = categoriaDoTitulo(t);
    const g = porChave.get(cat)!;
    g.total += t.valorAberto;
    g.quantidade += 1;
    if (cat === "RECORRENTE") {
      const vt = tipoDaSerie.get(chaveDaSerie(t)) ?? null;
      g.porTipoValor[vt ?? "SEM_SERIE"] += t.valorAberto;
      g.titulos.push({ ...t, valorTipo: vt });
    } else g.titulos.push(t);
    const mes = t.vencimento.slice(0, 7);
    if (!t.vencimento) g.semData += t.valorAberto;
    else if (t.vencimento < hoje) g.vencidos += t.valorAberto;
    else if (mes in g.porMes) g.porMes[mes] += t.valorAberto;
    else g.depois += t.valorAberto;
  }
  for (const g of grupos) g.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numTit.localeCompare(b.numTit));
  return { meses, grupos, total: grupos.reduce((s, g) => s + g.total, 0), quantidade: grupos.reduce((s, g) => s + g.quantidade, 0) };
}
