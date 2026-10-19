// Previsao por centro de custo (somente leitura). Tudo vem dos titulos EM ABERTO que o Senior ja tem para o CCU: nada e' cadastrado nem
// estimado aqui. A unica "inteligencia" e' agrupar cada titulo numa categoria; a regra e' simples e transparente:
//   1. fornecedor/descricao com palavra de veiculo (locadora, ...) -> Parcelas de veiculos
//   2. fornecedor/descricao com palavra de TI (notebook, Dell, ...) -> Parcelas de computadores e TI
//   3. tipo PRV (previsao lancada no Senior)                      -> Despesas recorrentes
//   4. tem OC (no titulo ou vinculada) ou NF de compra            -> Aquisicoes
//   5. o resto                                                    -> Demais titulos em aberto
// Titulo que nao casa com nenhuma palavra NAO e' forcado numa categoria: cai em "Demais" e fica visivel.

export type CategoriaPrevisao = "RECORRENTE" | "VEICULO" | "TI" | "AQUISICAO" | "DEMAIS";

export const CATEGORIAS: { chave: CategoriaPrevisao; rotulo: string; descricao: string }[] = [
  { chave: "RECORRENTE", rotulo: "Despesas recorrentes", descricao: "Previsões lançadas no Senior (tipo PRV) que não são de veículo nem de TI: aluguel, contratos mensais, serviços fixos." },
  { chave: "VEICULO", rotulo: "Parcelas de veículos", descricao: "Títulos em aberto cujo fornecedor ou descrição indica veículo, locação, financiamento ou frota." },
  { chave: "TI", rotulo: "Parcelas de computadores e TI", descricao: "Títulos em aberto cujo fornecedor ou descrição indica computador, notebook ou equipamento de TI." },
  { chave: "AQUISICAO", rotulo: "Aquisições", descricao: "Títulos em aberto de compras, com ordem de compra ou nota fiscal de compra vinculada." },
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
  vencimento: string; // yyyy-mm-dd (programado, ou o original)
  valorAberto: number;
  origemCcu?: "titulo" | "oc" | "oc-rateada" | null; // de onde veio o CC: do proprio titulo ou da OC vinculada
  numOcpVinculada?: string | null;
};

export function categoriaDoTitulo(t: Pick<TituloPrevisao, "tipo" | "fornecedorNome" | "descricao" | "numOcp" | "numNfc"> & { numOcpVinculada?: string | null }): CategoriaPrevisao {
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

export type GrupoPrevisao = {
  chave: CategoriaPrevisao;
  rotulo: string;
  descricao: string;
  total: number;
  quantidade: number;
  vencidos: number; // valor com vencimento anterior a hoje (ainda em aberto)
  depois: number; // valor alem da janela de meses
  porMes: Record<string, number>; // chave yyyy-mm, so' dentro da janela
  titulos: TituloPrevisao[]; // mais proximos primeiro
};

export const MESES_JANELA = 12;

export function montarPrevisao(titulos: TituloPrevisao[], hoje: string): { meses: string[]; grupos: GrupoPrevisao[]; total: number; quantidade: number } {
  const mesHoje = hoje.slice(0, 7);
  const meses = Array.from({ length: MESES_JANELA }, (_, i) => somaMeses(mesHoje, i));
  const grupos: GrupoPrevisao[] = CATEGORIAS.map((c) => ({ ...c, total: 0, quantidade: 0, vencidos: 0, depois: 0, porMes: Object.fromEntries(meses.map((m) => [m, 0])), titulos: [] }));
  const porChave = new Map(grupos.map((g) => [g.chave, g]));
  for (const t of titulos) {
    const g = porChave.get(categoriaDoTitulo(t))!;
    g.total += t.valorAberto;
    g.quantidade += 1;
    g.titulos.push(t);
    const mes = t.vencimento.slice(0, 7);
    if (t.vencimento < hoje) g.vencidos += t.valorAberto;
    else if (mes in g.porMes) g.porMes[mes] += t.valorAberto;
    else g.depois += t.valorAberto;
  }
  for (const g of grupos) g.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numTit.localeCompare(b.numTit));
  return { meses, grupos, total: grupos.reduce((s, g) => s + g.total, 0), quantidade: grupos.reduce((s, g) => s + g.quantidade, 0) };
}
