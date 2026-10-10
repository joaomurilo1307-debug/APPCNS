"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CampoItem, ProblemaItem } from "@/lib/cnab240/itau/validacaoItem";
import type { RelatorioConferencia } from "@/lib/pagamentos/conferenciaRemessa";
import { removerDaSelecaoSalva } from "@/lib/selecaoProgramacao";
import { corrigirChavePix } from "@/lib/cnab240/itau/chavePix";
import { montarBlocoSenior, podeAtualizarPagamento } from "@/lib/pagamentos/preenchimentoRemessa";
import { identificacaoBeneficiarioBoleto } from "@/lib/pagamentos/beneficiarioBoleto";

type Titulo = {
  id: string;
  numTit: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string;
  pago: boolean;
  vencimentoProgramado: string | null;
  valorAberto: number;
  codigoBarrasBoleto: string | null;
  bancoFavorecido: string | null;
  agenciaFavorecido: string | null;
  contaFavorecido: string | null;
  dacFavorecido: string | null;
  chavePix: string | null;
  tipoChavePix: string | null;
  documentoFavorecido: string | null;
  tipo: string; // PRV = provisão contábil (não é pagamento)
  codFpg: string | null; // forma de pagamento na Senior (18 boleto, 19 PIX...)
  cartaoCredito?: boolean;
};

// Resposta de POST /api/pagamentos-itau/dados-senior (leitura ao vivo da Senior).
type DadosSenior = {
  tituloId: string;
  numOcp: string | null;
  documento: string | null;
  origemDocumento?: string | null;
  problemas?: string[];
  conta: { banco: string; agencia: string; conta: string; dac: string; fonte: "titulo" | "cadastro" | "oc"; nota?: string } | null;
  chavePix: { tipo: "01" | "02" | "03" | "04"; valor: string; fonte: "titulo" | "cadastro" | "oc" } | null;
  codigoBarras: string | null;
  codFpg: string | null;
  formaPagamento: string | null;
  achouNoSenior: boolean;
};

// `completo` = todas as consultas à Senior responderam (só então vale dizer "a Senior não tem nada").
type ResultadoSenior = { dados: Map<string, DadosSenior>; provisoes: Set<string>; avisos: string[]; consultadoEm: string; completo: boolean };

// Nota 37 do manual SISPAG (mesmos códigos do TPCPIX da Senior).
const TIPO_CHAVE_PIX: Record<string, string> = { "1": "telefone", "2": "e-mail", "3": "CPF/CNPJ", "4": "aleatória" };

function contaCompleta(t: Titulo): boolean {
  return !!(t.bancoFavorecido && t.agenciaFavorecido && t.contaFavorecido && t.dacFavorecido);
}

type ContaBancaria = {
  id: string;
  apelido: string;
  cnpj: string;
  agencia: string;
  conta: string;
  dac: string;
};

type Segmento = "A" | "J";

type ItemCarrinho = {
  chave: string; // ID completo do titulo: numero/fornecedor nao distinguem tipos e emissoes.
  tituloId: string | null;
  numTit: string;
  fornecedorNome: string;
  favorecidoNome: string; // nome que vai no CNAB (beneficiário do boleto / titular da conta) -- editável, pois o fornecedor do Senior pode ser genérico
  preenchidoAutomaticamente: boolean;
  segmento: Segmento;
  formaPagamento: string;
  favorecidoTipoDoc: "1" | "2";
  favorecidoDocumento: string;
  bancoFavorecido: string;
  agenciaFavorecido: string;
  contaFavorecido: string;
  dacFavorecido: string;
  codigoBarras: string;
  valor: number;
  dataPagamento: string;
  chavePix?: string; // rótulo pra exibição ("chave (tipo)")
  // Segmento B obrigatório pra PIX no modelo "Chave" (Nota 37 do manual) --
  // só preenchido quando formaPagamento = "45" e não há conta bancária completa.
  chavePixTipo?: "01" | "02" | "03" | "04";
  chavePixValor?: string;
  // Foto do bloco de pagamento como veio da Senior (só quando preenchido
  // automaticamente). Serve pra, quando a Senior mudar esse dado, atualizar o item
  // SÓ se ninguém tiver mexido nele à mão (bloco ainda igual à foto).
  snapshotAuto?: string;
  snapshotDocumentoAuto?: string;
  beneficiarioBoletoConferido?: string | null;
  // Última leitura ao vivo na Senior deste título: o que ela tinha na hora.
  senior?: { consultadoEm: string; temPagamento: boolean; completo: boolean; forma: string | null; numOcp: string | null; codBarSenior: boolean; tituloLocalizado?: boolean; origemDocumento?: string | null; problemas?: string[] };
  // Conta/PIX que vieram da OC (texto digitado pelo comprador), não do cadastro
  // da Senior -- a tela pede conferência. Só vale enquanto o bloco está intacto.
  dadosDaOc?: string;
};

type BlocoPagamento = Pick<
  ItemCarrinho,
  "formaPagamento" | "segmento" | "bancoFavorecido" | "agenciaFavorecido" | "contaFavorecido" | "dacFavorecido" | "codigoBarras" | "chavePixTipo" | "chavePixValor"
>;

function blocoPagamento(i: BlocoPagamento) {
  return JSON.stringify([
    i.formaPagamento,
    i.segmento,
    i.bancoFavorecido,
    i.agenciaFavorecido,
    i.contaFavorecido,
    i.dacFavorecido,
    i.codigoBarras,
    i.chavePixTipo ?? "",
    i.chavePixValor ?? "",
  ]);
}

// Chave PIX que é o CPF/CNPJ do favorecido digitado como telefone na Senior (caso 007940) entra já
// como CPF/CNPJ (tipo 03) -- o servidor faz a mesma correção ao conferir e ao gerar o arquivo.
function ajustarChavePix(item: ItemCarrinho): ItemCarrinho {
  if (item.formaPagamento !== "45") return item;
  const c = corrigirChavePix(item.chavePixTipo, item.chavePixValor, item.favorecidoDocumento);
  if (!c.correcao) return item;
  return { ...item, chavePixTipo: c.tipo as ItemCarrinho["chavePixTipo"], chavePixValor: c.valor, chavePix: `${c.valor} (CPF/CNPJ)` };
}

function soDigitosTexto(v: string) {
  return v.replace(/\D/g, "");
}

// Nota 37 do manual: código de 2 dígitos no CNAB. Mesma numeração do TPCPIX
// da Senior ("1" a "4"), só com zero à esquerda.
function tipoChavePixCnab(tpcpix: string | null): "01" | "02" | "03" | "04" | undefined {
  const mapa: Record<string, "01" | "02" | "03" | "04"> = { "1": "01", "2": "02", "3": "03", "4": "04" };
  return tpcpix ? mapa[tpcpix] : undefined;
}

// Forma de pagamento da Senior -> o que a tela pré-seleciona. Só boleto e PIX
// mudam o que precisa ser preenchido (linha digitável / chave); o resto segue
// o padrão da tela. Pela descrição do catálogo F066FPG; sem ela, pelo código
// (18 = Boleto, 19 = PIX, confirmados no catálogo E066FPG da Consominas).
function formaDaSenior(codFpg: string | null | undefined, descricao?: string | null): "boleto" | "pix" | null {
  if (descricao) {
    if (/boleto/i.test(descricao)) return "boleto";
    if (/pix/i.test(descricao)) return "pix";
  }
  if (codFpg === "18") return "boleto";
  if (codFpg === "19") return "pix";
  return null;
}

function itemSemDadoDePagamento(i: ItemCarrinho) {
  return !i.codigoBarras.trim() && !i.agenciaFavorecido.trim() && !i.contaFavorecido.trim() && !i.dacFavorecido.trim() && !(i.chavePixValor ?? "").trim();
}

// Aplica o que a Senior tem AGORA num item do carrinho -- só em branco: nada do
// que foi digitado à mão é sobrescrito. Ordem: boleto > conta > chave PIX.
// Conta/PIX que só existem na OC entram marcados (`dadosDaOc`).
function aplicarDadosSenior(item: ItemCarrinho, d: DadosSenior, consultadoEm: string, completo: boolean): { item: ItemCarrinho; preencheu: string[] } {
  const preencheu: string[] = [];
  const proximo: ItemCarrinho = { ...item };
  const temPagamento = !!(d.codigoBarras || d.conta || d.chavePix);
  proximo.senior = { consultadoEm, temPagamento, completo, forma: d.formaPagamento, numOcp: d.numOcp, codBarSenior: !!d.codigoBarras, tituloLocalizado:d.achouNoSenior, origemDocumento:d.origemDocumento, problemas:d.problemas };
  if (!d.achouNoSenior || !completo) return {item:proximo,preencheu};

  if ((!soDigitosTexto(item.favorecidoDocumento) || item.snapshotDocumentoAuto === item.favorecidoDocumento) && d.documento) {
    proximo.favorecidoDocumento = d.documento;
    proximo.favorecidoTipoDoc = d.documento.length === 11 ? "1" : "2";
    proximo.snapshotDocumentoAuto = d.documento;
    preencheu.push("CPF/CNPJ");
  }

  if (podeAtualizarPagamento(item)) {
    const daOc = d.conta?.fonte === "oc" || (!d.conta && d.chavePix?.fonte === "oc");
    const bloco = montarBlocoSenior(d);
    if (bloco) {
      Object.assign(proximo,bloco,{chavePix:bloco.chavePixValor});
      preencheu.push(bloco.segmento === "J" ? "boleto do título" : d.conta ? "conta do título/cadastro" : "PIX do título");
      Object.assign(proximo, ajustarChavePix(proximo));
      proximo.preenchidoAutomaticamente = true;
      proximo.snapshotAuto = blocoPagamento(proximo);
      proximo.dadosDaOc = daOc ? (d.numOcp ? `OC ${d.numOcp}` : "OC") : undefined;
    }
  }

  return { item: proximo, preencheu };
}

type RetornoDaRemessa = {
  id: string;
  nomeArquivo: string;
  processadoEm: string;
  totalReconhecidos: number;
  temArquivo: boolean;
};

type ItemBaixa = { itemId: string; numTit: string; fornecedor: string; valor: number; dataPagamento: string | null; motivo: string | null };
type PreviaBaixa = {
  numCco: string;
  contaSenior?: { descricao: string; banco: string; agencia: string; conta: string };
  elegiveis: ItemBaixa[];
  jaBaixados: ItemBaixa[];
  bloqueados: ItemBaixa[];
  totalElegivel: number;
  enviados?: number;
  comErro?: number;
  erros?: { numTit: string; erro: string }[];
  simulacao: boolean;
  titulosAtualizados?: number;
};

type PainelBaixa = { remessaId: string; arquivo: string; numCco: string; previa: PreviaBaixa | null; carregando: boolean; erro: string | null };
type RemessaDoRetorno = { id: string; nomeArquivo: string | null; contaNumCcoSenior: string | null; qtdProntos: number; qtdConferir: number; qtdConcluidos: number };
type RetornoImportado = {
  id: string; nomeArquivo: string; processadoEm: string; totalRegistros: number; totalReconhecidos: number;
  naoReconhecidos: string[]; resumoStatus: Record<string, number>; remessasVinculadas: RemessaDoRetorno[]; legadoSemResumo: boolean;
};

type Remessa = {
  id: string;
  arquivadaEm: string | null;
  status: string;
  nomeArquivo: string | null;
  contaApelido: string;
  criadoPorNome: string | null;
  criadoEm: string;
  totalRegistros: number;
  totalValor: number;
  qtdItens: number;
  qtdPendentes: number;
  qtdPagos: number;
  qtdRejeitados: number;
  qtdPagosSemBaixa: number;
  qtdBaixados: number;
  qtdErroBaixa: number;
  qtdBaixaConferir: number;
  contaNumCcoSenior: string | null;
  retornos: RetornoDaRemessa[];
};

// Guarda o rascunho (carrinho, conta escolhida, filtros) no navegador -- sair
// da tela sem gerar a remessa (ou recarregar por engano) não pode apagar o
// trabalho de quem está montando um pagamento. Só localStorage (por
// navegador, não sincroniza entre pessoas/abas) -- não é onde mora o dado
// real, só evita perder o que ainda não foi enviado ao servidor.
const CHAVE_RASCUNHO = "pagamentosItau:rascunho:v1";

type Rascunho = {
  carrinho: ItemCarrinho[];
  contaSelecionadaId: string;
  busca: string;
  vencDe: string;
  vencAte: string;
};

function lerRascunho(): Partial<Rascunho> {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function salvarRascunho(r: Rascunho) {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r));
  } catch {
    // Modo privado/quota cheia -- perde só a conveniência de lembrar, não trava a tela.
  }
}

// Lê a resposta e FALHA com mensagem clara quando o servidor não respondeu direito (reinício,
// erro 5xx, resposta que não é JSON). Sem isso a tela lia a página de erro como se fosse dado
// e mostrava listas vazias ("Nenhuma remessa gerada ainda") com os dados intactos no banco.
async function lerOuFalhar(r: Response) {
  const data = await r.json().catch(() => null);
  if (!r.ok || data === null) {
    throw new Error((data && typeof data === "object" && (data as { error?: string }).error) || `Não foi possível carregar os dados (erro ${r.status}). Tente de novo em instantes.`);
  }
  return data;
}

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Um pagamento que já foi gerado em remessa (linha do Histórico de pagamentos).
type ItemHistorico = {
  id: string;
  remessaId: string;
  arquivo: string | null;
  geradaEm: string;
  contaApelido: string;
  tituloId: string | null;
  numTit: string | null;
  fornecedorNome: string | null;
  favorecidoNome: string;
  favorecidoTipoDoc: string;
  favorecidoDocumento: string;
  segmento: string;
  formaPagamento: string;
  bancoFavorecido: string | null;
  agenciaFavorecido: string | null;
  contaFavorecido: string | null;
  dacFavorecido: string | null;
  codigoBarras: string | null;
  chavePixTipo: string | null;
  chavePixValor: string | null;
  valor: number;
  dataPagamento: string;
  status: string;
  valorEfetivado: number | null;
  dataEfetivacao: string | null;
  baixaSeniorStatus: string | null;
  baixaSeniorMsg: string | null;
  baixaSeniorEm: string | null;
};

const TIPO_CHAVE_PIX_ITAU: Record<string, string> = { "01": "telefone", "02": "e-mail", "03": "CPF/CNPJ", "04": "aleatória" };

const STATUS_ITEM_ROTULO: Record<string, string> = {
  PENDENTE: "Aguardando o banco",
  AGENDADO: "Agendado",
  PAGO: "Pago",
  REJEITADO: "Rejeitado",
  CANCELADO: "Cancelado",
};

function formatDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

function formatarDocumento(doc: string) {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc || "—";
}

// O mesmo dado que o item tinha no carrinho: boleto -> código de barras; PIX -> chave;
// crédito/TED -> banco/agência/conta.
function dadosDePagamentoDoHistorico(i: ItemHistorico): string {
  if (i.segmento === "J") return i.codigoBarras ? `Boleto: ${i.codigoBarras}` : "—";
  if (i.chavePixValor) return `PIX (${TIPO_CHAVE_PIX_ITAU[i.chavePixTipo ?? ""] ?? "chave"}): ${i.chavePixValor}`;
  if (i.agenciaFavorecido || i.contaFavorecido) {
    return [
      i.bancoFavorecido ? `banco ${i.bancoFavorecido}` : null,
      i.agenciaFavorecido ? `ag ${i.agenciaFavorecido}` : null,
      i.contaFavorecido ? `cc ${i.contaFavorecido}${i.dacFavorecido ? `-${i.dacFavorecido}` : ""}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return "—";
}

const FORMAS: { valor: string; segmento: Segmento; label: string }[] = [
  { valor: "01", segmento: "A", label: "Crédito em conta corrente Itaú" },
  { valor: "41", segmento: "A", label: "TED — outro titular" },
  { valor: "43", segmento: "A", label: "TED — mesmo titular" },
  { valor: "45", segmento: "A", label: "PIX Transferência" },
  { valor: "30", segmento: "J", label: "Boleto Itaú" },
  { valor: "31", segmento: "J", label: "Boleto de outros bancos" },
];

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  GERADO: "Gerado — aguardando envio",
  RETORNO_PROCESSADO: "Retorno processado",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "bg-amber-100 text-amber-800",
  AGENDADO: "bg-sky-100 text-sky-800",
  PAGO: "bg-emerald-100 text-emerald-800",
  REJEITADO: "bg-red-100 text-red-700",
  CANCELADO: "bg-gray-200 text-gray-600",
};

export default function PagamentosItauPage() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [contaSelecionadaId, setContaSelecionadaId] = useState("");
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [limpandoRemessas, setLimpandoRemessas] = useState(false);
  const remessasVisiveis = remessas.filter(r => mostrarArquivadas || !r.arquivadaEm);
  const [retornos, setRetornos] = useState<RetornoImportado[]>([]);
  const [ultimoRetornoId, setUltimoRetornoId] = useState<string | null>(null);
  const [mostrarTodosRetornos, setMostrarTodosRetornos] = useState(false);
  const [importandoRetorno, setImportandoRetorno] = useState(false);
  // Histórico de pagamentos já gerados em remessa + os títulos que já viraram remessa ativa
  // (pendente/agendado/pago): não ficam no carrinho nem na lista de títulos em aberto.
  const [historico, setHistorico] = useState<{ itens: ItemHistorico[]; total: number }>({ itens: [], total: 0 });
  const [idsGerados, setIdsGerados] = useState<Set<string>>(new Set());
  const [mostrarJaGerados, setMostrarJaGerados] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState("");
  // Aviso de "isso já virou remessa e saiu do carrinho": fica em banner próprio porque a
  // `mensagem` comum é trocada pela próxima (ex.: o resultado da leitura ao vivo da Senior)
  // e a pessoa nem chegaria a ver.
  const [avisoJaGerados, setAvisoJaGerados] = useState<string | null>(null);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [painelBaixa, setPainelBaixa] = useState<PainelBaixa | null>(null);
  const sequenciaBaixa = useRef(0);
  const [gerando, setGerando] = useState(false);
  const [mostrarFormConta, setMostrarFormConta] = useState(false);
  const [novaConta, setNovaConta] = useState({ apelido: "", cnpj: "", agencia: "", conta: "", dac: "" });
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagemSync, setMensagemSync] = useState<string | null>(null);
  const [vencDe, setVencDe] = useState("");
  const [vencAte, setVencAte] = useState("");
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);
  // Relatório de conferência do carrinho (o que falta/está errado em cada
  // título), atualizado sozinho a cada mudança no carrinho.
  const [relatorio, setRelatorio] = useState<RelatorioConferencia | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const sequenciaConferencia = useRef(0);
  // Leitura ao vivo na Senior (CPF/CNPJ, conta, PIX, forma de pagamento) dos
  // itens do carrinho. `pedidoConsulta` dispara a leitura depois que o carrinho
  // novo já foi pintado (carrinhoRef atualizado).
  const [consultandoSenior, setConsultandoSenior] = useState(false);
  const [pedidoConsulta, setPedidoConsulta] = useState<{ n: number; todos: boolean }>({ n: 0, todos: false });
  const [adicionandoId, setAdicionandoId] = useState<string | null>(null);
  // true quando o carregamento falhou: as listas vazias NÃO significam "não há nada".
  const [falhaCarga, setFalhaCarga] = useState(false);
  // Carrinho atual acessível de dentro do carregamento assíncrono dos títulos.
  const carrinhoRef = useRef<ItemCarrinho[]>([]);
  carrinhoRef.current = carrinho;

  function carregarTudo(consultarTodos = false) {
    setLoading(true);
    return Promise.all([
      fetch("/api/titulos-pagar").then(lerOuFalhar),
      fetch("/api/pagamentos-itau/contas").then(lerOuFalhar),
      fetch("/api/pagamentos-itau/remessas").then(lerOuFalhar),
      fetch("/api/pagamentos-itau/retornos").then(lerOuFalhar),
      fetch("/api/pagamentos-itau/historico").then(lerOuFalhar),
    ])
      .then(([tit, cont, rem, ret, hist]) => {
        setFalhaCarga(false);
        setErro(null);
        const todosAbertos: Titulo[] = (tit.titulos ?? []).filter((t: Titulo) => !t.pago);
        // Provisão (PRV) é lançamento contábil de despesa futura (folha, ISS,
        // retirada...), não pagamento a fornecedor: não aparece pra remessa.
        const titulosAbertos = todosAbertos.filter((t) => t.tipo !== "PRV" && !t.cartaoCredito);
        setTitulos(titulosAbertos);

        // Histórico + títulos que já viraram remessa (pendente/agendado/pago).
        const gerados = new Set<string>(hist.tituloIdsGerados ?? []);
        setIdsGerados(gerados);
        setHistorico({ itens: hist.itens ?? [], total: hist.total ?? 0 });

        // O carrinho guarda só o que foi selecionado e AINDA NÃO virou remessa: o rascunho
        // salvo no navegador pode ter item que, nesse meio-tempo, foi gerado (em outra aba,
        // por outra pessoa, ou antes de o rascunho ser limpo). Esses saem daqui e ficam no
        // Histórico de pagamentos.
        const atualNoCarrinho = carrinhoRef.current;
        const jaGeradosNoCarrinho = atualNoCarrinho.filter((i) => i.tituloId && gerados.has(i.tituloId));
        const carrinhoSemGeradosAtuais =
          jaGeradosNoCarrinho.length > 0 ? atualNoCarrinho.filter((i) => !(i.tituloId && gerados.has(i.tituloId))) : atualNoCarrinho;
        const idsCartao = new Set(todosAbertos.filter(t => t.cartaoCredito).map(t => t.id));
        const carrinhoSemGerados = carrinhoSemGeradosAtuais.filter(i => !i.tituloId || !idsCartao.has(i.tituloId));
        if (jaGeradosNoCarrinho.length > 0) removerDaSelecaoSalva(jaGeradosNoCarrinho.map((i) => i.tituloId));

        // Itens que já estavam no carrinho recebem os dados novos da Senior
        // (CPF/CNPJ, conta, PIX) -- sem sobrescrever o que foi digitado.
        const { itens: carrinhoAtualizado, atualizados } = mesclarComDadosNovos(carrinhoSemGerados, titulosAbertos);
        if (atualizados.length > 0 || jaGeradosNoCarrinho.length > 0 || carrinhoSemGerados.length !== carrinhoSemGeradosAtuais.length) {
          setCarrinho(carrinhoAtualizado);
          if (jaGeradosNoCarrinho.length > 0) {
            setAvisoJaGerados(
              `${jaGeradosNoCarrinho.length} item(ns) do carrinho já tinham virado remessa e saíram dele (estão no Histórico de pagamentos): ${jaGeradosNoCarrinho.map((i) => i.numTit).join(", ")}.`
            );
          }
          if (atualizados.length > 0) setMensagem(`Dados novos da Senior chegaram em ${atualizados.length} item(ns) do carrinho: ${atualizados.join(", ")}.`);
        }
        setContas(cont.contas ?? []);
        setContaSelecionadaId((atual) => atual || (cont.contas ?? [])[0]?.id || "");
        setRemessas(rem.remessas ?? []);
        setRetornos(ret.retornos ?? []);

        // Handoff da Programação de Pagamento (30/09/2026): a pessoa seleciona
        // lá e manda pra cá sem redigitar -- os ids chegam pelo sessionStorage,
        // aqui so' precisa achar o titulo (mesma fonte /api/titulos-pagar) e
        // adicionar ao carrinho com o preenchimento automatico de sempre.
        //
        // Lote, nao confirmacao por item (01/10/2026): o clique manual
        // pergunta um por um antes de adicionar titulo sem forma de
        // pagamento, mas um lote de 20 aprovados nao pode abrir 20 popups
        // em sequencia -- aqui so' soma os "sem forma" e avisa tudo numa
        // mensagem so' no final.
        const pendente = sessionStorage.getItem("handoffRemessaItau");
        if (pendente) {
          sessionStorage.removeItem("handoffRemessaItau");
          try {
            const ids: string[] = JSON.parse(pendente);
            const porId = new Map(titulosAbertos.map((t) => [t.id, t]));
            const provisoes = ids.map((id) => todosAbertos.find((t) => t.id === id)).filter((t): t is Titulo => !!t && t.tipo === "PRV");
            const jaNoCarrinho = new Set(carrinhoRef.current.map((i) => i.tituloId));
            // Título que já virou remessa (pendente/agendado/pago) não volta pro carrinho.
            const jaGeradosDaProgramacao = ids.filter((id) => gerados.has(id) && !jaNoCarrinho.has(id));
            if (jaGeradosDaProgramacao.length > 0) removerDaSelecaoSalva(jaGeradosDaProgramacao);
            const encontrados = ids
              .map((id) => porId.get(id))
              .filter((t): t is Titulo => !!t && !jaNoCarrinho.has(t.id) && !gerados.has(t.id));
            const itensMontados = encontrados.map((t) => montarItemCarrinho(t));
            setCarrinho((c) => [...c, ...itensMontados]);
            const semForma = itensMontados.filter(semFormaDePagamento);
            if (encontrados.length > 0) {
              setMensagem(
                `${encontrados.length} título(s) trazido(s) da Programação de Pagamento` +
                  (semForma.length > 0
                    ? ` — conferindo agora na Senior o que ela tem de boleto/conta/PIX pra ${semForma.length} deles (sem isso no sistema)...`
                    : ".")
              );
            }
            if (provisoes.length > 0) {
              setMensagem(
                (m) =>
                  `${m ? `${m} ` : ""}${provisoes.length} provisão(ões) contábil(is) (PRV) ficaram de fora — não são pagamento a fornecedor: ${provisoes.map((t) => t.numTit).join(", ")}.`
              );
            }
            if (jaGeradosDaProgramacao.length > 0) {
              const textoHandoff = `${jaGeradosDaProgramacao.length} título(s) trazido(s) da Programação já tinham virado remessa e ficaram de fora (veja no Histórico de pagamentos).`;
              setAvisoJaGerados((a) => (a ? `${a} ${textoHandoff}` : textoHandoff));
            }
            const faltaram =
              ids.length - encontrados.length - provisoes.length - ids.filter((id) => jaNoCarrinho.has(id)).length - jaGeradosDaProgramacao.length;
            if (faltaram > 0) {
              setErro(`${faltaram} título(s) selecionado(s) não foram encontrados aqui (já pago ou não sincronizado) e não entraram no carrinho.`);
            }
          } catch {
            // handoff corrompido -- ignora silenciosamente, pessoa so' nao ve o carrinho pre-preenchido
          }
        }

        // Depois de montar/atualizar o carrinho, confere na Senior ao vivo o que
        // ela tem de dado de pagamento (o sistema pode estar atrás do sincronismo).
        setPedidoConsulta((p) => ({ n: p.n + 1, todos: consultarTodos }));
      })
      .catch((e) => {
        setErro(e.message);
        setFalhaCarga(true);
      })
      .finally(() => setLoading(false));
  }

  // Restaura o rascunho ANTES de carregar do servidor, pra não perder o
  // carrinho se a pessoa recarregou a página ou navegou e voltou. A conta
  // escolhida e o carrinho vêm do rascunho; contas/remessas vêm sempre do
  // servidor (são dado compartilhado, não pessoal desta aba).
  useEffect(() => {
    const r = lerRascunho();
    if (r.carrinho?.length) {
      setCarrinho(r.carrinho.map(i=>({...i,chave:i.tituloId ?? i.chave})));
      setMensagem(`Rascunho anterior restaurado: ${r.carrinho.length} item(ns) no carrinho que ainda não tinham virado remessa.`);
    }
    if (r.contaSelecionadaId) setContaSelecionadaId(r.contaSelecionadaId);
    if (r.busca) setBusca(r.busca);
    if (r.vencDe) setVencDe(r.vencDe);
    if (r.vencAte) setVencAte(r.vencAte);
    setRascunhoRestaurado(true);
    carregarTudo();
  }, []);

  // Lê na Senior (somente leitura, ao vivo) o que ela tem de CPF/CNPJ, conta,
  // chave PIX, boleto e forma de pagamento desses títulos. Devolve null se a
  // Senior não respondeu -- quem chama decide o que fazer.
  async function buscarNaSenior(ids: string[], limiteMs: number): Promise<ResultadoSenior | null> {
    const dados = new Map<string, DadosSenior>();
    const provisoes = new Set<string>();
    const avisos: string[] = [];
    let consultadoEm = new Date().toISOString();
    let completo = true;
    for (let i = 0; i < ids.length; i += 100) {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), limiteMs);
      try {
        const res = await fetch("/api/pagamentos-itau/dados-senior", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tituloIds: ids.slice(i, i + 100) }),
          signal: controle.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
        for (const d of data.dados as DadosSenior[]) dados.set(d.tituloId, d);
        for (const p of data.provisoes as string[]) provisoes.add(p);
        avisos.push(...(data.avisos as string[]));
        if (data.completo === false) completo = false;
        consultadoEm = data.consultadoEm ?? consultadoEm;
      } catch (e: any) {
        avisos.push(e?.name === "AbortError" ? "A Senior demorou demais pra responder." : String(e?.message ?? e));
        completo = false;
        if (dados.size === 0 && provisoes.size === 0) return null;
      } finally {
        clearTimeout(timer);
      }
    }
    return { dados, provisoes, avisos, consultadoEm, completo };
  }

  // Encaixa o resultado da leitura nos itens que estão no carrinho AGORA (não nos
  // de quando a leitura começou -- a pessoa pode ter digitado nesse meio-tempo).
  function aplicarResultadoSenior(resultado: ResultadoSenior, notificar: boolean) {
    const atual = carrinhoRef.current;
    const preenchidos: string[] = [];
    const semNada: string[] = [];
    const daOc: string[] = [];
    const itens = atual.map((item) => {
      const d = item.tituloId ? resultado.dados.get(item.tituloId) : undefined;
      if (!d) return item;
      const { item: novo, preencheu } = aplicarDadosSenior(item, d, resultado.consultadoEm, resultado.completo);
      if (preencheu.length > 0) preenchidos.push(`${item.numTit} (${preencheu.join(", ")})`);
      if (novo.dadosDaOc) daOc.push(item.numTit);
      if (resultado.completo && d.achouNoSenior && !novo.senior?.temPagamento && !novo.preenchidoAutomaticamente && itemSemDadoDePagamento(novo)) semNada.push(item.numTit);
      return novo;
    });
    // Uma resposta de leitura atrasada nunca reinsere um pagamento removido.
    const porChave = new Map(itens.map(i => [i.chave, i]));
    setCarrinho(atuais => atuais.map(i => porChave.get(i.chave) ?? i));
    if (notificar) {
      const hora = new Date(resultado.consultadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const partes = [resultado.completo ? `Senior consultada agora (${hora}).` : `Senior consultada às ${hora}, mas parte das consultas não respondeu — o resultado abaixo pode estar incompleto.`];
      partes.push(preenchidos.length > 0 ? `Dado novo em ${preenchidos.length} item(ns): ${preenchidos.join("; ")}.` : "Nenhum dado novo pra preencher.");
      if (daOc.length > 0) partes.push(`Conta/PIX que só existiam na OC (confira com o fornecedor): ${daOc.join(", ")}.`);
      if (semNada.length > 0) partes.push(`A Senior não tem boleto, conta nem chave PIX pra: ${semNada.join(", ")} — precisam de dado novo.`);
      if (resultado.provisoes.size > 0) partes.push(`${resultado.provisoes.size} provisão(ões) (PRV) no carrinho não são pagamento — tire.`);
      if (resultado.avisos.length > 0) partes.push(`Atenção: ${resultado.avisos.join(" · ")}`);
      setMensagem(partes.join(" "));
    }
  }

  // Dispara a leitura ao vivo: quando o carrinho foi (re)carregado ou a pessoa
  // clicou em "Atualizar dados dos itens". Automático = só itens ainda não
  // consultados (ou com leitura de mais de 5 min); manual = todos.
  useEffect(() => {
    if (pedidoConsulta.n === 0) return;
    const agora = Date.now();
    const alvo = carrinhoRef.current.filter(
      (i) => i.tituloId && (pedidoConsulta.todos || !i.senior || agora - new Date(i.senior.consultadoEm).getTime() > 5 * 60 * 1000)
    );
    if (alvo.length === 0) {
      setConsultandoSenior(false);
      return;
    }
    let cancelado = false;
    setConsultandoSenior(true);
    buscarNaSenior(alvo.map((i) => i.tituloId!), 160_000)
      .then((r) => {
        if (cancelado) return;
        if (!r) {
          const texto = "A Senior não respondeu agora — os dados do carrinho continuam os do último sincronismo. Clique em “↻ Atualizar dados dos itens” em instantes.";
          if (pedidoConsulta.todos) setErro(texto);
          else setMensagem(texto);
          return;
        }
        aplicarResultadoSenior(r, true);
      })
      .finally(() => {
        if (!cancelado) setConsultandoSenior(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoConsulta]);

  // Salva a cada mudança -- só depois de restaurar uma vez, pra não sobrescrever
  // um rascunho existente com o estado inicial vazio antes da leitura acima.
  useEffect(() => {
    if (!rascunhoRestaurado) return;
    salvarRascunho({ carrinho, contaSelecionadaId, busca, vencDe, vencAte });
  }, [rascunhoRestaurado, carrinho, contaSelecionadaId, busca, vencDe, vencAte]);

  // Conferência automática: 450ms depois da última mudança no carrinho, pede
  // ao servidor o relatório do que falta em cada título (mesma regra que a
  // geração usa pra recusar). `sequenciaConferencia` descarta resposta velha
  // que chegar depois de uma mais nova.
  useEffect(() => {
    if (!rascunhoRestaurado) return;
    if (carrinho.length === 0) {
      setRelatorio(null);
      setConferindo(false);
      return;
    }
    const minhaVez = ++sequenciaConferencia.current;
    setConferindo(true);
    const espera = setTimeout(() => {
      fetch("/api/pagamentos-itau/remessas/conferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: carrinho.map(itemParaApi), contaBancariaId: contaSelecionadaId || undefined }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Erro ao conferir");
          return data as RelatorioConferencia;
        })
        .then((data) => {
          if (minhaVez === sequenciaConferencia.current) setRelatorio(data);
        })
        .catch(() => {
          if (minhaVez === sequenciaConferencia.current) setRelatorio(null);
        })
        .finally(() => {
          if (minhaVez === sequenciaConferencia.current) setConferindo(false);
        });
    }, 450);
    return () => clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunhoRestaurado, carrinho, contaSelecionadaId]);

  // Problemas por item do carrinho (pra marcar o campo certo e listar embaixo
  // do item). Só vale se o relatório é do carrinho atual -- enquanto a
  // conferência nova não chega, não mostra marca velha de outro conteúdo.
  const problemasPorChave = useMemo(() => {
    const mapa = new Map<string, ProblemaItem[]>();
    if (!relatorio) return mapa;
    const linhasDosItens = relatorio.linhas.filter((l) => l.indice >= 0);
    if (linhasDosItens.length !== carrinho.length) return mapa;
    for (const l of linhasDosItens) {
      const item = carrinho[l.indice];
      if (item) mapa.set(item.chave, l.problemas);
    }
    return mapa;
  }, [relatorio, carrinho]);

  function classeCampo(chave: string, ...campos: CampoItem[]) {
    const doCampo = (problemasPorChave.get(chave) ?? []).filter((p) => campos.includes(p.campo));
    const base = "mt-0.5 w-full rounded border px-2 py-1";
    if (doCampo.some((p) => p.gravidade === "erro")) return `${base} border-red-400 bg-red-50`;
    if (doCampo.length > 0) return `${base} border-amber-400 bg-amber-50`;
    return `${base} border-gray-200`;
  }

  function irParaItem(chave: string) {
    const el = document.getElementById(`item-remessa-${chave}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const titulosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const jaNoCarrinho = new Set(carrinho.map((i) => i.tituloId));
    return titulos
      .filter((t) => !jaNoCarrinho.has(t.id))
      .filter((t) => mostrarJaGerados || !idsGerados.has(t.id))
      .filter(
        (t) =>
          !termo || t.numTit.toLowerCase().includes(termo) || t.fornecedorNome.toLowerCase().includes(termo)
      )
      .filter((t) => !vencDe || (t.vencimentoProgramado ?? "").slice(0, 10) >= vencDe)
      .filter((t) => !vencAte || (t.vencimentoProgramado ?? "").slice(0, 10) <= vencAte)
      .slice(0, 200);
  }, [titulos, busca, carrinho, vencDe, vencAte, idsGerados, mostrarJaGerados]);

  const qtdJaGeradosOcultos = useMemo(() => titulos.filter((t) => idsGerados.has(t.id)).length, [titulos, idsGerados]);

  const historicoFiltrado = useMemo(() => {
    const termo = buscaHistorico.trim().toLowerCase();
    if (!termo) return historico.itens;
    return historico.itens.filter((i) =>
      [i.numTit, i.fornecedorNome, i.favorecidoNome, i.arquivo, i.favorecidoDocumento]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo))
    );
  }, [historico, buscaHistorico]);

  // Monta o item do carrinho a partir de um título, sem efeito colateral --
  // separado de adicionarAoCarrinho pra poder ser chamado tanto no clique
  // manual (com confirmação) quanto no handoff em lote vindo da Programação
  // de Pagamento (sem popup por item, ver mais abaixo).
  function montarItemCarrinho(t: Titulo): ItemCarrinho {
    const hoje = new Date().toISOString().slice(0, 10);
    // ACHADO 01/10/2026: CPF/CNPJ só era preenchido dentro do ramo "conta
    // completa" -- título com boleto, ou com conta incompleta/nenhuma (mas
    // documento já conhecido pela Senior), perdia o documento à toa. CPF/CNPJ
    // é exigido pelo CNAB em QUALQUER segmento (A ou J), então entra aqui na
    // base, igual pros três casos.
    const documento = t.documentoFavorecido ?? "";
    const base: ItemCarrinho = {
      chave: t.id,
      tituloId: t.id,
      numTit: t.numTit,
      fornecedorNome: t.fornecedorNome,
      favorecidoNome: t.fornecedorNome,
      preenchidoAutomaticamente: false,
      segmento: "A",
      formaPagamento: "01",
      favorecidoTipoDoc: documento.length === 11 ? "1" : "2",
      favorecidoDocumento: documento,
      snapshotDocumentoAuto: documento,
      bancoFavorecido: "341",
      agenciaFavorecido: "",
      contaFavorecido: "",
      dacFavorecido: "",
      codigoBarras: "",
      valor: t.valorAberto,
      // Data de pagamento no passado o banco rejeita: se o vencimento já passou, sugere hoje.
      dataPagamento: t.vencimentoProgramado && t.vencimentoProgramado.slice(0, 10) >= hoje ? t.vencimentoProgramado.slice(0, 10) : hoje,
      chavePix: t.chavePix ? `${t.chavePix} (${TIPO_CHAVE_PIX[t.tipoChavePix ?? ""] ?? t.tipoChavePix ?? "?"})` : undefined,
    };

    // Preenche sozinho quando o sincronismo já trouxe o dado, em ordem de
    // prioridade: boleto > conta bancária completa > só chave Pix. Continua
    // editável — é um ponto de partida, não uma trava.
    //
    // ACHADO 01/10/2026 (manual SISPAG oficial, pedido do João): título sem
    // conta mas COM chave Pix cadastrada na Senior não precisa ficar em
    // branco -- o CNAB tem um Segmento B próprio pra isso ("modelo Chave",
    // Nota 37), obrigatório só nesse caso. Só fica realmente sem jeito de
    // preencher quando a Senior não tem boleto, nem conta, nem chave -- aí
    // o fornecedor nunca informou nenhuma forma de recebimento eletrônica.
    const tipoChaveCnab = tipoChavePixCnab(t.tipoChavePix);
    let item = base;
    if (t.codigoBarrasBoleto) {
      item = {
        ...base,
        preenchidoAutomaticamente: true,
        segmento: "J",
        formaPagamento: "31",
        codigoBarras: t.codigoBarrasBoleto,
      };
    } else if (contaCompleta(t)) {
      const contaItau = t.bancoFavorecido === "341" || t.bancoFavorecido === "409";
      item = {
        ...base,
        preenchidoAutomaticamente: true,
        // Chave PIX cadastrada no título -> PIX Transferência (mesma conta, só muda o código da forma).
        formaPagamento: t.chavePix ? "45" : contaItau ? "01" : "41",
        bancoFavorecido: t.bancoFavorecido!,
        agenciaFavorecido: t.agenciaFavorecido!,
        contaFavorecido: t.contaFavorecido!,
        dacFavorecido: t.dacFavorecido!,
        chavePixTipo: t.chavePix ? tipoChaveCnab : undefined,
        chavePixValor: t.chavePix ? t.chavePix : undefined,
      };
    } else if (t.chavePix && tipoChaveCnab) {
      item = {
        ...base,
        preenchidoAutomaticamente: true,
        formaPagamento: "45",
        // Sem conta real -- é a chave quem carrega o destino (Segmento B).
        // Zera os campos de conta do "base" (que default pra "341" quando
        // nenhum ramo se aplica) pra tela e validação reconhecerem certo
        // que este item não tem conta bancária.
        bancoFavorecido: "",
        agenciaFavorecido: "",
        contaFavorecido: "",
        dacFavorecido: "",
        chavePixTipo: tipoChaveCnab,
        chavePixValor: t.chavePix,
      };
    } else {
      // Sem dado de pagamento no sistema, mas a Senior diz COMO é pago: a forma
      // já entra certa e a conferência cobra o dado certo (linha digitável / chave).
      const forma = formaDaSenior(t.codFpg);
      if (forma === "boleto") item = { ...base, segmento: "J", formaPagamento: "31", bancoFavorecido: "" };
      else if (forma === "pix") item = { ...base, formaPagamento: "45", bancoFavorecido: "" };
    }

    const ajustado = ajustarChavePix(item);
    return ajustado.preenchidoAutomaticamente ? { ...ajustado, snapshotAuto: blocoPagamento(ajustado) } : ajustado;
  }

  // Dados que chegaram depois (sincronização da Senior, CPF/CNPJ ou conta que
  // alguém cadastrou/corrigiu lá): atualiza os itens que JÁ estão no carrinho,
  // sem nunca sobrescrever o que foi digitado à mão.
  //  - CPF/CNPJ em branco no item e agora disponível -> preenche.
  //  - Item sem nenhum dado de pagamento digitado e a Senior agora tem boleto/
  //    conta/PIX -> adota o bloco de pagamento da Senior.
  //  - Item preenchido pela Senior e ainda igual à foto de quando entrou, mas a
  //    Senior mudou -> adota o bloco novo (correção feita lá chega aqui).
  function mesclarComDadosNovos(carrinhoAtual: ItemCarrinho[], titulosAtuais: Titulo[]) {
    const porId = new Map(titulosAtuais.map((t) => [t.id, t]));
    const atualizados: string[] = [];
    const itens = carrinhoAtual.map((item) => {
      const t = item.tituloId ? porId.get(item.tituloId) : undefined;
      if (!t) return item;
      const novo = montarItemCarrinho(t);
      const proximo: ItemCarrinho = { ...item };
      let mudou = false;

      if (!soDigitosTexto(item.favorecidoDocumento) && soDigitosTexto(novo.favorecidoDocumento)) {
        proximo.favorecidoDocumento = novo.favorecidoDocumento;
        proximo.favorecidoTipoDoc = novo.favorecidoTipoDoc;
        mudou = true;
      }

      const semDadoDePagamento =
        !item.codigoBarras.trim() &&
        !item.agenciaFavorecido.trim() &&
        !item.contaFavorecido.trim() &&
        !item.dacFavorecido.trim() &&
        !(item.chavePixValor ?? "").trim();
      const intactoDesdeASenior = !!item.preenchidoAutomaticamente && !!item.snapshotAuto && blocoPagamento(item) === item.snapshotAuto;
      const seniorMudou = novo.preenchidoAutomaticamente && blocoPagamento(novo) !== (item.snapshotAuto ?? "");
      if (novo.preenchidoAutomaticamente && seniorMudou && (semDadoDePagamento || intactoDesdeASenior)) {
        proximo.formaPagamento = novo.formaPagamento;
        proximo.segmento = novo.segmento;
        proximo.bancoFavorecido = novo.bancoFavorecido;
        proximo.agenciaFavorecido = novo.agenciaFavorecido;
        proximo.contaFavorecido = novo.contaFavorecido;
        proximo.dacFavorecido = novo.dacFavorecido;
        proximo.codigoBarras = novo.codigoBarras;
        proximo.chavePixTipo = novo.chavePixTipo;
        proximo.chavePixValor = novo.chavePixValor;
        proximo.chavePix = novo.chavePix;
        proximo.preenchidoAutomaticamente = true;
        proximo.snapshotAuto = novo.snapshotAuto;
        proximo.dadosDaOc = undefined;
        mudou = true;
      }

      if (mudou) atualizados.push(item.numTit);
      return mudou ? proximo : item;
    });
    return { itens, atualizados };
  }

  // true quando a Senior não tem boleto, conta nem chave Pix pra esse título
  // -- nenhuma forma automática de preenchimento se aplicou.
  function semFormaDePagamento(item: ItemCarrinho): boolean {
    return !item.preenchidoAutomaticamente;
  }

  function motivoSemFormaDePagamento(item: ItemCarrinho): string {
    return item.favorecidoDocumento
      ? `Este título não tem boleto, conta bancária nem chave PIX cadastrados na Senior — só o CPF/CNPJ (${item.favorecidoDocumento}). Vai entrar sem forma de pagamento definida, pra completar na mão.`
      : "Este título não tem boleto, conta bancária, chave PIX nem CPF/CNPJ cadastrados na Senior. Vai entrar totalmente em branco, pra completar na mão.";
  }

  // Clique manual na lista "Títulos em aberto": pedido do João 01/10/2026 --
  // quando não sobra nenhuma forma automática, avisa o motivo e confirma
  // antes de adicionar, em vez de só jogar no carrinho sem a pessoa perceber
  // que falta tudo.
  //
  // 06/10/2026: antes de perguntar, confere na Senior AO VIVO -- o sistema pode
  // estar atrás do sincronismo, e perguntar "não tem nada na Senior" com dado
  // velho seria dizer uma coisa que não é verdade. Se a Senior não responder
  // em 30s, cai no que o sistema tem e a pergunta diz isso.
  async function adicionarAoCarrinho(t: Titulo) {
    if (adicionandoId) return;
    let item = montarItemCarrinho(t);
    let consultou = false;
    if (semFormaDePagamento(item) || !soDigitosTexto(item.favorecidoDocumento)) {
      setAdicionandoId(t.id);
      try {
        const r = await buscarNaSenior([t.id], 30_000);
        const d = r?.dados.get(t.id);
        if (r && d) {
          consultou = r.completo;
          item = aplicarDadosSenior(item, d, r.consultadoEm, r.completo).item;
          if (r.provisoes.has(t.id)) return;
        }
      } finally {
        setAdicionandoId(null);
      }
    }
    if (semFormaDePagamento(item)) {
      const aviso = consultou ? "" : "\n\n(Não consegui consultar a Senior agora — isto é o que o sistema tem do último sincronismo. Clique em “↻ Atualizar dados dos itens” depois pra conferir ao vivo.)";
      const confirmado = window.confirm(`${t.numTit} — ${t.fornecedorNome}\n\n${motivoSemFormaDePagamento(item)}${aviso}\n\nAdicionar mesmo assim?`);
      if (!confirmado) return;
    }
    setCarrinho((c) => (c.some((i) => i.chave === item.chave) ? c : [...c, item]));
  }

  // Fire-and-forget (30/09/2026): a rota so' dispara o webhook e volta na
  // hora -- a sincronizacao de verdade roda no VPS (SSH, sem proxy no meio,
  // ver nota na rota). Por isso aqui so' avisa que foi disparado e recarrega
  // a lista sozinho depois de alguns minutos, igual a Programacao de Pagamento.
  async function sincronizarComSenior() {
    setSincronizando(true);
    setErro(null);
    setMensagemSync(null);
    try {
      const res = await fetch("/api/pagamentos-itau/sincronizar-titulos", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao disparar a sincronização");
      setMensagemSync(data.mensagem || "Sincronização disparada.");
      setTimeout(() => {
        carregarTudo();
        setMensagemSync("Lista atualizada com o retrato mais recente do Senior.");
      }, 150000);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSincronizando(false);
    }
  }

  function atualizarItem(chave: string, patch: Partial<ItemCarrinho>) {
    setCarrinho((c) => c.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  }

  function removerDoCarrinho(chave: string) {
    setCarrinho((c) => c.filter((i) => i.chave !== chave));
  }

  async function criarConta() {
    setErro(null);
    const res = await fetch("/api/pagamentos-itau/contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novaConta),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error || "Erro ao cadastrar conta");
      return;
    }
    setMostrarFormConta(false);
    setNovaConta({ apelido: "", cnpj: "", agencia: "", conta: "", dac: "" });
    carregarTudo();
  }

  function itemParaApi(i: ItemCarrinho) {
    return {
      tituloId: i.tituloId,
      segmento: i.segmento,
      formaPagamento: i.formaPagamento,
      favorecidoNome: i.favorecidoNome,
      favorecidoTipoDoc: i.favorecidoTipoDoc,
      favorecidoDocumento: i.favorecidoDocumento.replace(/\D/g, ""),
      bancoFavorecido: i.segmento === "A" ? i.bancoFavorecido : undefined,
      agenciaFavorecido: i.segmento === "A" ? i.agenciaFavorecido : undefined,
      contaFavorecido: i.segmento === "A" ? i.contaFavorecido : undefined,
      dacFavorecido: i.segmento === "A" ? i.dacFavorecido : undefined,
      codigoBarras: i.segmento === "J" ? i.codigoBarras.replace(/\D/g, "") : undefined,
      beneficiarioBoletoConferido: i.beneficiarioBoletoConferido,
      chavePixTipo: i.formaPagamento === "45" ? i.chavePixTipo : undefined,
      chavePixValor: i.formaPagamento === "45" ? i.chavePixValor : undefined,
      valor: i.valor,
      dataPagamento: i.dataPagamento,
    };
  }

  // Uma geração só (06/10/2026, pedido do João: "a remessa deve ser uma só"):
  // o servidor confere TODOS os itens juntos antes de gravar qualquer coisa. Se
  // sobrar problema, nada é gerado e volta o relatório completo do que falta
  // em cada título (nada de remessa parcial nem erro genérico). Quando está
  // tudo certo, gera de uma vez -- em 1 arquivo, ou em 2 quando o carrinho
  // mistura PIX com boleto/TED/crédito (o Itaú exige o PIX em arquivo separado).
  // `somenteValidos`: gera só com os itens sem erro e deixa os outros no
  // carrinho, já marcados, pra corrigir e gerar depois.
  async function gerarRemessa(somenteValidos = false) {
    if (loading || falhaCarga || !contaSelecionadaId || carrinho.length === 0) return;
    setGerando(true);
    setErro(null);
    setMensagem(null);
    try {
      const res = await fetch("/api/pagamentos-itau/remessas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contaBancariaId: contaSelecionadaId, itens: carrinho.map(itemParaApi), somenteValidos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.conferencia) setRelatorio(data.conferencia as RelatorioConferencia);
        setErro(data.error || "Não foi possível gerar a remessa.");
        document.getElementById("conferencia-remessa")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const geradas: { nomeArquivo: string | null; tipo: string; qtdItens: number; totalValor: number }[] = data.remessas ?? [];
      const ignorados: { indice: number }[] = data.ignorados ?? [];
      const chavesFicaram = new Set(ignorados.map((l) => carrinho[l.indice]?.chave).filter((c): c is string => !!c));
      const chavesEnviadas = new Set(carrinho.map(i => i.chave));
      const restantes = carrinhoRef.current.filter(i => !chavesEnviadas.has(i.chave) || chavesFicaram.has(i.chave));
      carrinhoRef.current = restantes;
      setCarrinho(restantes);
      salvarRascunho({ carrinho: restantes, contaSelecionadaId, busca, vencDe, vencAte });
      const geradosAgora = carrinho.filter(i => !chavesFicaram.has(i.chave)).map(i => i.tituloId).filter((id): id is string => !!id);
      setIdsGerados(atuais => new Set([...atuais, ...geradosAgora]));
      removerDaSelecaoSalva(carrinho.filter((i) => !chavesFicaram.has(i.chave)).map((i) => i.tituloId));
      setMensagem(
        `Remessa gerada: ${geradas
          .map((g) => `${g.nomeArquivo ?? "arquivo"} (${g.qtdItens} ${g.tipo === "PIX" ? "PIX" : "boleto/TED/crédito"}, ${formatMoeda(g.totalValor)})`)
          .join(" + ")}.` +
          (geradas.length > 1 ? " São 2 arquivos porque o Itaú exige o PIX separado dos demais pagamentos." : "") +
          (ignorados.length > 0
            ? ` ${ignorados.length} item(ns) com problema ficaram no carrinho — corrija o que a conferência aponta e gere de novo.`
            : "")
      );
      carregarTudo();
    } catch (e: any) {
      setErro(`Não foi possível confirmar a geração: ${e.message}. Confira as remessas e o histórico antes de tentar novamente.`);
    } finally {
      setGerando(false);
    }
  }

  async function limparRemessas(acao: "limpar" | "restaurar") {
    const selecionadas = remessas.filter(r => acao === "limpar" ? !r.arquivadaEm : !!r.arquivadaEm);
    if (!selecionadas.length) return;
    setLimpandoRemessas(true);
    setErro(null);
    try {
      const res = await fetch("/api/pagamentos-itau/remessas/limpar", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, remessaIds: selecionadas.map(r => r.id) }) });
      const data = await lerOuFalhar(res);
      await carregarTudo();
      setMensagem(`${data.quantidade} remessa(s) ${acao === "limpar" ? "arquivada(s)" : "restaurada(s)"}. Os pagamentos e retornos continuam no histórico.`);
    } catch (e: any) { setErro(e.message); }
    finally { setLimpandoRemessas(false); }
  }

  async function chamarBaixa(confirmar: boolean, painelInicial?: PainelBaixa) {
    const painel = painelInicial ?? painelBaixa;
    if (!painel) return;
    const pedido = ++sequenciaBaixa.current;
    setPainelBaixa((p) => (p ? { ...p, carregando: true, erro: null } : p));
    try {
      const res = await fetch(`/api/pagamentos-itau/remessas/${painel.remessaId}/baixa-senior`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar, ...(painel.numCco.trim() ? { numCcoSenior: painel.numCco.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao conferir a baixa");
      if (pedido === sequenciaBaixa.current) setPainelBaixa((p) => (p?.remessaId === painel.remessaId ? { ...p, previa: data, numCco: data.numCco ?? p.numCco, carregando: false } : p));
      if (confirmar) carregarTudo();
    } catch (e: any) {
      if (pedido === sequenciaBaixa.current) setPainelBaixa((p) => (p?.remessaId === painel.remessaId ? { ...p, carregando: false, previa: null, erro: `${e.message}. Confira novamente a prévia antes de enviar.` } : p));
      if (confirmar) carregarTudo();
    }
  }

  function abrirBaixa(r: Pick<Remessa, "id" | "nomeArquivo" | "contaNumCcoSenior">) {
    const painel: PainelBaixa = { remessaId: r.id, arquivo: r.nomeArquivo ?? r.id, numCco: r.contaNumCcoSenior ?? "", previa: null, carregando: false, erro: null };
    setPainelBaixa(painel);
    if (painel.numCco) chamarBaixa(false, painel);
  }

  useEffect(() => {
    if (painelBaixa?.remessaId) document.getElementById("painel-baixa-senior")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [painelBaixa?.remessaId]);

  async function enviarRetorno(file: File) {
    if (importandoRetorno) return;
    setErro(null);
    setMensagem(null);
    setImportandoRetorno(true);
    try {
    if (file.size > 10_000_000) throw new Error("Arquivo excede o limite de 10 MB.");
    const conteudo = await file.text();
    const res = await fetch("/api/pagamentos-itau/retornos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomeArquivo: file.name, conteudo }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error || "Erro ao processar retorno");
      return;
    }
    setUltimoRetornoId(data.retorno.id);
    const r = data.resumoStatus ?? {};
    if (data.duplicado) {
      setMensagem("Este retorno já foi importado. As pendências atuais aparecem abaixo; você pode continuar a conferência e a baixa sem reprocessar o arquivo.");
      carregarTudo();
      return;
    }
    setMensagem(
      `Retorno processado: ${data.totalReconhecidos} de ${data.totalLido} pagamento(s) reconhecidos` +
        ` — ${r.PAGO ?? 0} pago(s), ${r.AGENDADO ?? 0} agendado(s), ${r.REJEITADO ?? 0} rejeitado(s), ${r.CANCELADO ?? 0} cancelado(s).` +
        (data.naoReconhecidos.length > 0 ? ` ${data.naoReconhecidos.length} sem correspondência.` : "") +
        (data.prontosParaBaixa > 0
          ? ` ${data.prontosParaBaixa} pronto(s) para conferência e baixa na Sênior. Continue pelo resultado da importação abaixo.`
          : (r.AGENDADO ?? 0) > 0
            ? " Os agendados só ficam prontos para baixa no retorno do dia do pagamento."
            : "")
    );
    carregarTudo();
    } catch (e: any) {
      await carregarTudo();
      setErro(`Não foi possível confirmar a importação: ${e.message}. Confira os retornos importados antes de repetir.`);
    } finally { setImportandoRetorno(false); }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Pagamentos Itaú (SISPAG)</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
          Gera o arquivo de remessa CNAB240 (padrão SISPAG do Itaú) a partir de títulos em aberto e processa o arquivo de retorno
          para atualizar o status de cada pagamento. Boleto, conta bancária ou chave PIX vêm direto da sincronização com a
          Senior, respeitando a forma do título. O Itaú exige o PIX
          em arquivo separado de boleto/TED — o sistema separa sozinho, numa geração só. Antes de gerar, a Conferência mostra o que
          falta em cada título. A geração consulta novamente a Sênior e bloqueia dados incompletos ou divergentes.
          Confira o beneficiário de cada boleto: o CPF/CNPJ do fornecedor pode ser diferente do registrado no banco.
        </p>
        <p className="mt-2 max-w-3xl text-sm font-medium text-sky-800">
          Para concluir os pagamentos: importe o retorno do Itaú, confira os títulos e confirme a baixa na Sênior pelo sistema.
          A programação é atualizada após a liquidação ser conferida na Sênior.
        </p>
      </div>

      {erro && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 whitespace-pre-wrap rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{erro}</span>
          {falhaCarga && (
            <button onClick={() => carregarTudo()} className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
              Tentar de novo
            </button>
          )}
        </div>
      )}
      {falhaCarga && (
        <p className="mb-4 text-xs text-gray-500">
          Os dados não carregaram — as listas abaixo estão vazias por causa disso, <span className="font-medium">não porque sumiram</span>. Nada foi apagado.
        </p>
      )}
      {avisoJaGerados && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{avisoJaGerados}</span>
          <div className="flex shrink-0 gap-3 text-xs">
            <a href="#historico-pagamentos" className="underline decoration-dotted underline-offset-2">
              ver histórico
            </a>
            <button onClick={() => setAvisoJaGerados(null)} className="underline decoration-dotted underline-offset-2">
              fechar
            </button>
          </div>
        </div>
      )}
      {mensagem && <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{mensagem}</div>}

      <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Conta de débito:</label>
          <select
            value={contaSelecionadaId}
            onChange={(e) => setContaSelecionadaId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="">selecione...</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido} — ag {c.agencia} cc {c.conta}-{c.dac}
              </option>
            ))}
          </select>
          <button
            onClick={() => setMostrarFormConta((v) => !v)}
            className="text-xs text-brand underline decoration-dotted underline-offset-2"
          >
            {mostrarFormConta ? "cancelar" : "+ cadastrar conta"}
          </button>
        </div>
        {mostrarFormConta && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[11px] text-gray-500">Apelido</label>
              <input
                value={novaConta.apelido}
                onChange={(e) => setNovaConta({ ...novaConta, apelido: e.target.value })}
                className="w-40 rounded border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500">CNPJ (14 dígitos)</label>
              <input
                value={novaConta.cnpj}
                onChange={(e) => setNovaConta({ ...novaConta, cnpj: e.target.value.replace(/\D/g, "") })}
                className="w-36 rounded border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500">Agência</label>
              <input
                value={novaConta.agencia}
                onChange={(e) => setNovaConta({ ...novaConta, agencia: e.target.value.replace(/\D/g, "") })}
                className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500">Conta</label>
              <input
                value={novaConta.conta}
                onChange={(e) => setNovaConta({ ...novaConta, conta: e.target.value.replace(/\D/g, "") })}
                className="w-28 rounded border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500">DAC</label>
              <input
                value={novaConta.dac}
                onChange={(e) => setNovaConta({ ...novaConta, dac: e.target.value.replace(/\D/g, "").slice(0, 1) })}
                className="w-14 rounded border border-gray-200 px-2 py-1 text-sm"
              />
            </div>
            <button onClick={criarConta} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white">
              Salvar conta
            </button>
          </div>
        )}
      </div>

      {carrinho.length > 0 && (
        <div id="conferencia-remessa" className="mb-5 rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">Conferência antes de gerar</p>
              <p className="text-[11px] text-gray-500">
                O que falta ou está errado em cada título, calculado a cada mudança no carrinho. Corrija direto nos itens ao lado — nada é gerado
                enquanto houver problema.
              </p>
            </div>
            <button
              onClick={() => carregarTudo(true)}
              disabled={consultandoSenior}
              title="Consulta a Senior AGORA (ao vivo) pra cada item do carrinho. Se alguém completou CPF/CNPJ, conta, chave PIX ou forma de pagamento lá, o item recebe o dado novo — sem apagar o que você digitou."
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {consultandoSenior ? "Consultando a Senior…" : "↻ Atualizar dados dos itens"}
            </button>
            {relatorio ? (
              relatorio.resumo.comErro === 0 && !relatorio.erroGeral ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  ✓ Tudo certo pra gerar · {relatorio.resumo.total} item(ns) · {formatMoeda(relatorio.resumo.valorTotal)}
                  {relatorio.resumo.comAviso > 0 ? ` · ${relatorio.resumo.comAviso} com aviso` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  {relatorio.resumo.comErro > 0
                    ? `✗ ${relatorio.resumo.comErro} de ${relatorio.resumo.total} item(ns) com dado faltando ou errado`
                    : "✗ O arquivo não pôde ser montado — veja o motivo abaixo"}
                </span>
              )
            ) : (
              <span className="text-xs text-gray-400">{conferindo ? "Conferindo…" : "—"}</span>
            )}
          </div>

          {relatorio?.erroGeral && (
            <p className="border-b border-red-100 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">{relatorio.erroGeral}</p>
          )}

          {relatorio && relatorio.linhas.some((l) => l.problemas.length > 0) && (
            <div className="max-h-[340px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-gray-50 text-left text-[11px] text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Título</th>
                    <th className="px-3 py-1.5 font-medium">Fornecedor</th>
                    <th className="px-3 py-1.5 text-right font-medium">Valor</th>
                    <th className="px-3 py-1.5 font-medium">O que falta / o que está errado</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas
                    .filter((l) => l.problemas.length > 0)
                    .map((l, pos) => {
                      const item = l.indice >= 0 ? carrinho[l.indice] : undefined;
                      return (
                        <tr key={`${l.indice}-${pos}`} className="border-t border-gray-50 align-top">
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">
                            {l.numTit ?? item?.numTit ?? "—"}
                            {item && (
                              <button onClick={() => irParaItem(item.chave)} className="ml-2 text-[11px] font-normal text-brand underline decoration-dotted">
                                ir ao item
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{l.fornecedor}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{l.valor !== null ? formatMoeda(l.valor) : "—"}</td>
                          <td className="px-3 py-2">
                            <ul className="space-y-1">
                              {l.problemas.map((p, i) => (
                                <li key={i} className={p.gravidade === "erro" ? "text-red-700" : "text-amber-700"}>
                                  <span className="mr-1 font-semibold">{p.gravidade === "erro" ? "Falta/erro" : "Atenção"} · {p.rotulo}:</span>
                                  {p.mensagem}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {relatorio && relatorio.resumo.comErro > 0 && relatorio.resumo.total - relatorio.resumo.comErro > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 p-3 text-[12px] text-gray-600">
              <span>
                Quer sair com o que já está certo? Os {relatorio.resumo.total - relatorio.resumo.comErro} item(ns) sem problema (
                {formatMoeda(relatorio.resumo.valorPronto)}) saem agora; os com problema continuam aqui, marcados, pra você corrigir e gerar depois.
              </span>
              <button
                onClick={() => gerarRemessa(true)}
                disabled={loading || falhaCarga || gerando || !contaSelecionadaId}
                className="rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-light disabled:opacity-40"
              >
                Gerar só com os {relatorio.resumo.total - relatorio.resumo.comErro} sem problema
              </button>
            </div>
          )}

          {relatorio && relatorio.resumo.comErro === 0 && carrinho.some((i) => i.formaPagamento === "45") && carrinho.some((i) => i.formaPagamento !== "45") && (
            <p className="border-t border-gray-100 p-3 text-[11px] text-gray-500">
              Esta geração vai produzir <span className="font-semibold">2 arquivos</span>: o Itaú exige que os pagamentos PIX vão em arquivo separado dos
              demais (boleto/TED/crédito). É uma geração só — você baixa os dois na lista de remessas.
            </p>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-700">Títulos em aberto</p>
              <button
                onClick={sincronizarComSenior}
                disabled={sincronizando}
                title="Dispara a sincronização com a Senior (títulos + dados bancários). Roda em segundo plano, leva 2-3 minutos pra refletir aqui."
                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {sincronizando ? "Disparando..." : "Atualizar do Senior agora"}
              </button>
            </div>
            {mensagemSync && <p className="mb-2 text-[11px] text-gray-500">{mensagemSync}</p>}
            <input
              type="text"
              placeholder="buscar título ou fornecedor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
              <span>Vencimento de</span>
              <input
                type="date"
                value={vencDe}
                onChange={(e) => setVencDe(e.target.value)}
                className="rounded border border-gray-200 px-1.5 py-1 text-[12px] focus:border-brand focus:outline-none"
              />
              <span>até</span>
              <input
                type="date"
                value={vencAte}
                onChange={(e) => setVencAte(e.target.value)}
                className="rounded border border-gray-200 px-1.5 py-1 text-[12px] focus:border-brand focus:outline-none"
              />
              {(vencDe || vencAte) && (
                <button
                  onClick={() => {
                    setVencDe("");
                    setVencAte("");
                  }}
                  className="text-brand underline decoration-dotted underline-offset-2"
                >
                  limpar
                </button>
              )}
            </div>
            {qtdJaGeradosOcultos > 0 && (
              <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-500">
                <input type="checkbox" checked={mostrarJaGerados} onChange={(e) => setMostrarJaGerados(e.target.checked)} />
                {mostrarJaGerados
                  ? `Mostrando também os ${qtdJaGeradosOcultos} título(s) que já viraram remessa (aguardando banco ou baixa)`
                  : `${qtdJaGeradosOcultos} título(s) já viraram remessa e estão ocultos — veja no Histórico de pagamentos`}
              </label>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {titulosFiltrados.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50">
                    <td className="max-w-[110px] truncate px-3 py-1.5 font-medium text-gray-800">{t.numTit}</td>
                    <td className="max-w-[160px] truncate px-3 py-1.5" title={t.fornecedorNome}>
                      {t.fornecedorNome}
                      {idsGerados.has(t.id) && (
                        <span
                          className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700"
                          title="Já está numa remessa gerada (aguardando o banco ou a baixa). Adicionar de novo pode pagar em dobro."
                        >
                          já em remessa
                        </span>
                      )}
                      {(t.codigoBarrasBoleto || contaCompleta(t)) && (
                        <span
                          className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700"
                          title="Dado bancário já veio do sincronismo — não precisa digitar."
                        >
                          auto
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(t.vencimentoProgramado)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatMoeda(t.valorAberto)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => adicionarAoCarrinho(t)}
                        disabled={!!adicionandoId}
                        title={adicionandoId === t.id ? "Conferindo na Senior o que ela tem de dado de pagamento…" : undefined}
                        className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand hover:bg-brand/20 disabled:opacity-50"
                      >
                        {adicionandoId === t.id ? "consultando…" : "adicionar"}
                      </button>
                    </td>
                  </tr>
                ))}
                {titulosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      Nenhum título encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 p-3">
            <p className="text-sm font-semibold text-gray-700">Itens da remessa ({carrinho.length})</p>
            <button
              onClick={() => gerarRemessa(false)}
              disabled={loading || falhaCarga || gerando || carrinho.length === 0 || !contaSelecionadaId || (relatorio?.resumo.comErro ?? 0) > 0 || !!relatorio?.erroGeral}
              title={
                (relatorio?.resumo.comErro ?? 0) > 0 || !!relatorio?.erroGeral
                  ? "Há itens com dado faltando ou errado -- veja a Conferência acima e corrija antes de gerar."
                  : !contaSelecionadaId
                    ? "Selecione a conta de débito."
                    : undefined
              }
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {gerando ? "Gerando..." : "Gerar remessa"}
            </button>
          </div>
          <div className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto">
            {carrinho.map((item) => {
              const formaInfo = FORMAS.find((f) => f.valor === item.formaPagamento)!;
              return (
                <div key={item.chave} id={`item-remessa-${item.chave}`} className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">
                      {item.numTit} · {item.fornecedorNome}
                      {item.preenchidoAutomaticamente && (
                        <span
                          className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700"
                          title="Preenchido automaticamente pelo sincronismo — confira antes de gerar a remessa."
                        >
                          auto
                        </span>
                      )}
                      {item.dadosDaOc && blocoPagamento(item) === item.snapshotAuto && (
                        <span
                          className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800"
                          title="Conta/chave PIX que o comprador digitou na OC (texto livre) — não vieram do cadastro do fornecedor na Senior. Confira com o fornecedor antes de gerar."
                        >
                          da {item.dadosDaOc} — confira
                        </span>
                      )}
                      {item.senior?.forma && (
                        <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-800" title="Forma de pagamento cadastrada na Senior pra este título/OC.">
                          Senior: {item.senior.forma}
                        </span>
                      )}
                    </span>
                    <button onClick={() => removerDoCarrinho(item.chave)} className="text-[11px] text-red-500 underline">
                      remover
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <label className="col-span-2">
                      Forma de pagamento
                      <select
                        value={item.formaPagamento}
                        onChange={(e) => {
                          const forma = FORMAS.find((f) => f.valor === e.target.value)!;
                          atualizarItem(item.chave, { formaPagamento: forma.valor, segmento: forma.segmento });
                        }}
                        className={classeCampo(item.chave, "formaPagamento")}
                      >
                        {FORMAS.map((f) => (
                          <option key={f.valor} value={f.valor}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-2">
                      Nome do favorecido (beneficiário do boleto / titular da conta)
                      <input
                        value={item.favorecidoNome}
                        onChange={(e) => atualizarItem(item.chave, { favorecidoNome: e.target.value })}
                        className={classeCampo(item.chave, "favorecidoNome")}
                      />
                    </label>
                    <label>
                      CPF/CNPJ favorecido
                      <input
                        value={item.favorecidoDocumento}
                        onChange={(e) => atualizarItem(item.chave, { favorecidoDocumento: e.target.value })}
                        className={classeCampo(item.chave, "favorecidoDocumento")}
                      />
                    </label>
                    <label>
                      Tipo doc.
                      <select
                        value={item.favorecidoTipoDoc}
                        onChange={(e) => atualizarItem(item.chave, { favorecidoTipoDoc: e.target.value as "1" | "2" })}
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                      >
                        <option value="2">CNPJ</option>
                        <option value="1">CPF</option>
                      </select>
                    </label>
                    <label>
                      Valor
                      <input
                        type="number"
                        step="0.01"
                        value={item.valor}
                        onChange={(e) => atualizarItem(item.chave, { valor: Number(e.target.value) })}
                        className={classeCampo(item.chave, "valor")}
                      />
                    </label>
                    <label>
                      Data de pagamento
                      <input
                        type="date"
                        value={item.dataPagamento}
                        onChange={(e) => atualizarItem(item.chave, { dataPagamento: e.target.value })}
                        className={classeCampo(item.chave, "dataPagamento")}
                      />
                    </label>

                    {formaInfo.segmento === "J" ? (
                      <label className="col-span-2">
                        Código de barras / linha digitável do boleto
                        <input
                          value={item.codigoBarras}
                          onChange={(e) => atualizarItem(item.chave, { codigoBarras: e.target.value })}
                          placeholder="44 ou 47 dígitos"
                          className={classeCampo(item.chave, "codigoBarras")}
                        />
                      </label>
                    ) : (
                      <>
                        {item.formaPagamento === "45" && (
                          // PIX (Nota 37 do manual): vale a chave PIX OU a conta bancária
                          // completa -- por isso os dois ficam visíveis. Com a chave, o
                          // Segmento B carrega o destino e a conta é dispensada.
                          <>
                            <p className="col-span-2 text-[11px] text-gray-500">
                              PIX: preencha a <span className="font-medium">chave PIX</span> (e o tipo) <span className="font-medium">ou</span> a conta
                              bancária completa abaixo.
                            </p>
                            <label>
                              Tipo de chave
                              <select
                                value={item.chavePixTipo ?? ""}
                                onChange={(e) => atualizarItem(item.chave, { chavePixTipo: (e.target.value || undefined) as ItemCarrinho["chavePixTipo"] })}
                                className={classeCampo(item.chave, "chavePix")}
                              >
                                <option value="">selecione...</option>
                                <option value="01">Telefone</option>
                                <option value="02">E-mail</option>
                                <option value="03">CPF/CNPJ</option>
                                <option value="04">Chave aleatória</option>
                              </select>
                            </label>
                            <label>
                              Chave PIX
                              <input
                                value={item.chavePixValor ?? ""}
                                onChange={(e) => atualizarItem(item.chave, { chavePixValor: e.target.value })}
                                className={classeCampo(item.chave, "chavePix")}
                              />
                            </label>
                          </>
                        )}
                        <label>
                          Banco favorecido
                          <input
                            value={item.bancoFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { bancoFavorecido: e.target.value.replace(/\D/g, "") })}
                            className={classeCampo(item.chave, "bancoFavorecido")}
                          />
                        </label>
                        <label>
                          Agência
                          <input
                            value={item.agenciaFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { agenciaFavorecido: e.target.value.replace(/\D/g, "") })}
                            className={classeCampo(item.chave, "agenciaFavorecido")}
                          />
                        </label>
                        <label>
                          Conta
                          <input
                            value={item.contaFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { contaFavorecido: e.target.value.replace(/\D/g, "") })}
                            className={classeCampo(item.chave, "contaFavorecido")}
                          />
                        </label>
                        <label>
                          DAC
                          <input
                            value={item.dacFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { dacFavorecido: e.target.value.replace(/[^0-9xXpP]/g, "").toUpperCase().slice(0, 1) })}
                            className={classeCampo(item.chave, "dacFavorecido")}
                          />
                        </label>
                      </>
                    )}
                    {item.chavePix && item.formaPagamento === "45" && !!item.bancoFavorecido && (
                      <p className="col-span-2 text-[11px] text-gray-500">
                        Chave PIX na Senior: <span className="font-medium text-gray-700">{item.chavePix}</span> — informativo; já há
                        conta bancária real, o arquivo usa a conta acima (Segmento B leva a chave como complemento).
                      </p>
                    )}
                  </div>
                  {item.senior?.problemas?.map((p,k)=><p key={k} className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{p}</p>)}
                  {item.segmento === "J" && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <p>CPF/CNPJ consultado: {item.senior?.origemDocumento === "titulo" ? "favorecido do titulo" : item.senior?.origemDocumento === "cadastro" ? "favorecido do cadastro" : item.senior?.origemDocumento === "fornecedor" ? "cadastro do fornecedor (pode ser diferente do beneficiario do boleto)" : "preenchimento local/manual"}. A validacao dos digitos do boleto e do documento nao consulta o cadastro CIP.</p>
                      <label className="mt-2 flex items-start gap-2 font-medium">
                        <input type="checkbox" aria-label={`Conferir beneficiario do boleto ${item.numTit}`} disabled={!identificacaoBeneficiarioBoleto(item.favorecidoDocumento,item.codigoBarras)}
                          checked={!!item.beneficiarioBoletoConferido && item.beneficiarioBoletoConferido === identificacaoBeneficiarioBoleto(item.favorecidoDocumento,item.codigoBarras)}
                          onChange={e=>atualizarItem(item.chave,{beneficiarioBoletoConferido:e.target.checked?identificacaoBeneficiarioBoleto(item.favorecidoDocumento,item.codigoBarras):null})}/>
                        Conferi este CPF/CNPJ com o beneficiario registrado no boleto ou na consulta do banco.
                      </label>
                    </div>
                  )}
                  {item.senior?.tituloLocalizado && item.senior.completo && !item.senior.temPagamento && itemSemDadoDePagamento(item) && (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                      Conferi na Senior às{" "}
                      {new Date(item.senior.consultadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}:{" "}
                      {/boleto/i.test(item.senior.forma ?? "")
                        ? `este título é "${item.senior.forma}" na Senior, mas a consulta deste titulo nao retornou uma linha digitavel valida. Confira os avisos e o cadastro, ou copie do boleto/PDF do fornecedor.`
                        : `sem boleto, sem conta bancária e sem chave PIX pra este fornecedor${item.senior.numOcp ? ` (nem na OC ${item.senior.numOcp})` : ""}. Preencha aqui com o que o fornecedor mandar — ou cadastre na Senior e clique em “↻ Atualizar dados dos itens”.`}
                    </p>
                  )}
                  {item.segmento === "J" && item.codigoBarras.trim() && item.senior?.completo && item.senior.codBarSenior === false && (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                      Este código de barras está preenchido no app. O retorno será vinculado à referência desta remessa;
                      a baixa pelo sistema usa o título vinculado na Sênior, após confirmação do pagamento pelo Itaú.
                    </p>
                  )}
                  {(problemasPorChave.get(item.chave) ?? []).length > 0 && (
                    <ul className="mt-2 space-y-0.5 rounded-lg bg-gray-50 p-2 text-[11px]">
                      {(problemasPorChave.get(item.chave) ?? []).map((p, i) => (
                        <li key={i} className={p.gravidade === "erro" ? "text-red-700" : "text-amber-700"}>
                          • <span className="font-semibold">{p.rotulo}:</span> {p.mensagem}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {carrinho.length === 0 && <p className="p-4 text-center text-sm text-gray-400">Adicione títulos da lista ao lado.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <p className="text-sm font-semibold text-gray-700">Remessas geradas</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-gray-600"><input type="checkbox" checked={mostrarArquivadas} onChange={e => setMostrarArquivadas(e.target.checked)} /> Mostrar arquivadas</label>
            <button onClick={() => limparRemessas("limpar")} disabled={limpandoRemessas || !remessas.some(r => !r.arquivadaEm)} className="text-xs text-brand underline disabled:opacity-40" title="Arquiva a lista e preserva o histórico, os retornos e os bloqueios contra pagamento duplicado">Limpar todas as remessas</button>
            {mostrarArquivadas && <button onClick={() => limparRemessas("restaurar")} disabled={limpandoRemessas || !remessas.some(r => r.arquivadaEm)} className="text-xs text-brand underline disabled:opacity-40">Restaurar remessas</button>}
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            {importandoRetorno ? "Validando retorno..." : "Importar arquivo de retorno"}
            <input
              type="file"
              accept=".ret,.txt,.rem,.dat"
              disabled={importandoRetorno}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void enviarRetorno(file);
                e.target.value = "";
              }}
            />
          </label>
          </div>
        </div>
        {retornos.length > 0 && (
          <div className="space-y-2 border-b border-gray-100 bg-gray-50/50 p-4 text-xs">
            <p className="font-semibold text-gray-800">Últimos retornos importados — continue a conferência e a baixa</p>
            {([...retornos.filter(r => r.id === ultimoRetornoId), ...retornos.filter(r => r.id !== ultimoRetornoId)]).slice(0, mostrarTodosRetornos ? 50 : 5).map(ret => (
              <details key={ret.id} open={ret.id === ultimoRetornoId} className="rounded-lg border border-gray-200 bg-white p-3">
                <summary className="cursor-pointer font-medium text-gray-700">
                  {ret.nomeArquivo} — {ret.totalReconhecidos}/{ret.totalRegistros} reconhecidos — {formatData(ret.processadoEm)}
                </summary>
                <div className="mt-2 space-y-2">
                  {ret.legadoSemResumo ? <p className="text-gray-500">Arquivo histórico sem resumo detalhado. Confira a remessa vinculada.</p> : (
                    <p>{ret.resumoStatus.PAGO ?? 0} pago(s), {ret.resumoStatus.AGENDADO ?? 0} agendado(s), {ret.resumoStatus.REJEITADO ?? 0} rejeitado(s), {ret.resumoStatus.CANCELADO ?? 0} cancelado(s).</p>
                  )}
                  {ret.naoReconhecidos.length > 0 && <p className="break-all rounded bg-amber-50 p-2 text-amber-800">Sem correspondência; não foram enviados à Sênior: {ret.naoReconhecidos.join(", ")}.</p>}
                  {ret.remessasVinculadas.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                      <span>{r.nomeArquivo ?? r.id}: {r.qtdProntos} a conferir para baixa, {r.qtdConferir} inconclusivo(s), {r.qtdConcluidos} concluído(s) na Sênior.</span>
                      {(r.qtdProntos > 0 || r.qtdConferir > 0) && <button disabled={painelBaixa?.carregando} onClick={() => abrirBaixa(r)} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white disabled:opacity-50">Conferir na Sênior</button>}
                    </div>
                  ))}
                  {(ret.resumoStatus.AGENDADO ?? 0) > 0 && <p className="text-sky-800">Agendamentos aguardam o retorno de liquidação do banco e não autorizam baixa.</p>}
                </div>
              </details>
            ))}
            {retornos.length > 5 && <button onClick={() => setMostrarTodosRetornos(v => !v)} className="text-brand underline">{mostrarTodosRetornos ? "Mostrar apenas os últimos 5" : "Ver os últimos 50 retornos"}</button>}
          </div>
        )}
        {painelBaixa && (
          <div id="painel-baixa-senior" className="space-y-3 border-b border-gray-100 bg-sky-50/50 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-800">Baixa na Sênior — {painelBaixa.arquivo}</p>
                <p className="text-xs text-gray-500">
                  Cada título é conferido ao vivo na Sênior antes de enviar. Só entram os que o banco confirmou como pagos, ainda abertos na Sênior
                  e com valor pago igual ao em aberto.
                </p>
              </div>
              <button disabled={painelBaixa.carregando} onClick={() => { sequenciaBaixa.current++; setPainelBaixa(null); }} className="text-xs text-gray-500 underline disabled:opacity-50">
                fechar
              </button>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              Conta interna da Sênior (numCco, tela F600CCO):
              <input
                value={painelBaixa.numCco}
                disabled={painelBaixa.carregando}
                onChange={(e) => setPainelBaixa((p) => (p ? { ...p, numCco: e.target.value, previa: null } : p))}
                maxLength={14}
                placeholder="ex.: 341"
                className="w-36 rounded-lg border border-gray-200 px-2 py-1 text-sm"
              />
              <button
                onClick={() => chamarBaixa(false)}
                disabled={painelBaixa.carregando || !painelBaixa.numCco.trim()}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                {painelBaixa.carregando ? "Conferindo na Sênior..." : "Conferir prévia (não grava)"}
              </button>
            </label>
            {painelBaixa.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{painelBaixa.erro}</p>}
            {painelBaixa.previa?.contaSenior && (
              <p className="text-xs text-emerald-700">
                ✓ Conta interna {painelBaixa.previa.numCco} = {painelBaixa.previa.contaSenior.descricao} (banco {painelBaixa.previa.contaSenior.banco}, ag{" "}
                {painelBaixa.previa.contaSenior.agencia}, cc {painelBaixa.previa.contaSenior.conta}) — confere com a conta bancária da remessa.
              </p>
            )}
            {painelBaixa.previa && (
              <div className="space-y-2">
                {painelBaixa.previa.simulacao ? (
                  <p className="text-xs font-medium text-gray-700">
                    Prévia: {painelBaixa.previa.elegiveis.length} título(s) prontos para baixa ({formatMoeda(painelBaixa.previa.totalElegivel)}),{" "}
                    {painelBaixa.previa.jaBaixados.length} já baixado(s) na Sênior, {painelBaixa.previa.bloqueados.length} que exigem baixa manual.
                  </p>
                ) : (
                  <p className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-800">
                    Resultado: {painelBaixa.previa.enviados ?? 0} baixado(s) com sucesso, {painelBaixa.previa.comErro ?? 0} com erro,{" "}
                    {painelBaixa.previa.jaBaixados.length} já estavam baixados na Sênior. {painelBaixa.previa.titulosAtualizados ?? 0} título(s)
                    atualizado(s) na Programação de Pagamento após conferência na Sênior.
                  </p>
                )}
                {painelBaixa.previa.simulacao && painelBaixa.previa.elegiveis.length > 0 && (
                  <ul className="max-h-40 overflow-auto rounded-lg bg-white p-2 text-xs text-gray-700">
                    {painelBaixa.previa.elegiveis.map((i) => (
                      <li key={i.itemId}>
                        {i.numTit} — {i.fornecedor} — {formatMoeda(i.valor)} — pago em {formatData(i.dataPagamento)}
                      </li>
                    ))}
                  </ul>
                )}
                {painelBaixa.previa.bloqueados.length > 0 && (
                  <ul className="max-h-40 overflow-auto rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    {painelBaixa.previa.bloqueados.map((i) => (
                      <li key={i.itemId}>
                        {i.numTit} — {i.fornecedor}: {i.motivo}
                      </li>
                    ))}
                  </ul>
                )}
                {(painelBaixa.previa.erros ?? []).length > 0 && (
                  <ul className="max-h-40 overflow-auto rounded-lg bg-red-50 p-2 text-xs text-red-700">
                    {painelBaixa.previa.erros!.map((e, idx) => (
                      <li key={idx}>
                        {e.numTit}: {e.erro}
                      </li>
                    ))}
                  </ul>
                )}
                {painelBaixa.previa.jaBaixados.length > 0 && <p className="text-xs text-emerald-700">Já liquidados na Sênior: {painelBaixa.previa.jaBaixados.map(i => i.numTit).join(", ")}. A confirmação conclui a conferência destes itens sem reenviar a baixa.</p>}
                {painelBaixa.previa.simulacao && (painelBaixa.previa.elegiveis.length > 0 || painelBaixa.previa.jaBaixados.length > 0) && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Gravar a baixa de ${painelBaixa.previa!.elegiveis.length} título(s), total ${formatMoeda(painelBaixa.previa!.totalElegivel)}, ` +
                            `na conta interna "${painelBaixa.numCco}" da Sênior? ` +
                            (painelBaixa.previa!.elegiveis.length ? "Isso escreve no contas a pagar e na tesouraria da Sênior. " : "Nenhuma nova baixa será enviada. ") +
                            `${painelBaixa.previa!.jaBaixados.length} título(s) já liquidado(s) serão atualizados no sistema.`
                        )
                      )
                        chamarBaixa(true);
                    }}
                    disabled={painelBaixa.carregando}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {painelBaixa.previa.elegiveis.length > 0 ? "Confirmar baixa na Sênior" : "Concluir conferência dos já liquidados"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Arquivo</th>
              <th className="px-3 py-2 font-medium">Conta</th>
              <th className="px-3 py-2 font-medium">Gerado em</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Itens</th>
              <th className="px-3 py-2 text-right font-medium">Valor total</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {remessasVisiveis.map((r) => (
              <tr key={r.id} className="border-t border-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-800">{r.nomeArquivo ?? "—"}{r.arquivadaEm && <span className="ml-2 text-xs text-gray-400">arquivada</span>}</td>
                <td className="px-3 py-1.5 text-gray-500">{r.contaApelido}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(r.criadoEm)}</td>
                <td className="px-3 py-1.5">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_LABEL.PENDENTE}`}>{r.qtdPendentes} pend.</span>{" "}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_LABEL.PAGO}`}>{r.qtdPagos} pagos</span>{" "}
                  {r.qtdRejeitados > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_LABEL.REJEITADO}`}>
                      {r.qtdRejeitados} rejeitados
                    </span>
                  )}
                  {r.qtdBaixados > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700" title="Baixa já lançada na Sênior">
                      {r.qtdBaixados} baixados na Sênior
                    </span>
                  )}
                  {r.qtdErroBaixa > 0 && (
                    <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700" title="A Sênior recusou a baixa — abra o painel para ver o motivo e tentar de novo">
                      {r.qtdErroBaixa} erro de baixa
                    </span>
                  )}
                  {r.qtdBaixaConferir > 0 && (
                    <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800" title="Envio em processamento ou sem confirmação conclusiva. Abra a prévia e confira a Sênior antes de repetir.">
                      {r.qtdBaixaConferir} baixa(s) a conferir
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoeda(r.totalValor)}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.qtdPagosSemBaixa > 0 && (
                    <button
                      onClick={() => abrirBaixa(r)}
                      className="mr-3 rounded-lg bg-brand px-2 py-1 text-[11px] font-medium text-white hover:brightness-95"
                      title="Dá baixa na Senior (GerarBaixaPorLoteCP) dos pagamentos que o banco confirmou. Mostra uma prévia antes de gravar."
                    >
                      Baixar {r.qtdPagosSemBaixa} pago(s) na Sênior
                    </button>
                  )}
                  <a href={`/api/pagamentos-itau/remessas/${r.id}/arquivo`} className="text-xs text-brand underline">
                    baixar .rem
                  </a>
                </td>
              </tr>
            ))}
            {remessasVisiveis.flatMap((r) =>
              r.retornos.map((ret) => (
                <tr key={ret.id} className="border-t border-gray-50 bg-gray-50/40 text-gray-500">
                  <td className="px-3 py-1 pl-6 text-[12px]" colSpan={3}>
                    ↳ retorno importado: {ret.nomeArquivo} ({formatData(ret.processadoEm)}, {ret.totalReconhecidos}{" "}
                    reconhecido(s))
                  </td>
                  <td className="px-3 py-1" colSpan={3} />
                  <td className="px-3 py-1 text-right">
                    {ret.temArquivo ? (
                      <a
                        href={`/api/pagamentos-itau/retornos/${ret.id}/arquivo-senior`}
                        title="Cópia do retorno original em CRLF. A baixa dos arquivos gerados aqui é feita pelo web service; esta cópia não garante importação no Pagamento Eletrônico da Sênior."
                        className="text-[11px] text-brand underline decoration-dotted underline-offset-2"
                      >
                        baixar cópia do retorno (.REM)
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-300" title="Retorno importado antes desta função existir — sem conteúdo salvo pra reexportar">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
            {remessasVisiveis.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  {remessas.length ? "Lista limpa. Marque Mostrar arquivadas para consultar ou restaurar as remessas." : "Nenhuma remessa gerada ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div id="historico-pagamentos" className="mt-5 rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Histórico de pagamentos</p>
            <p className="text-[11px] text-gray-400">
              Tudo que já foi gerado em remessa, com o dia em que o arquivo foi gerado.
              {historico.total > historico.itens.length
                ? ` Mostrando os ${historico.itens.length} mais recentes de ${historico.total}.`
                : historico.total > 0
                  ? ` ${historico.total} pagamento(s).`
                  : ""}
            </p>
          </div>
          <input
            type="text"
            placeholder="buscar título, favorecido, CPF/CNPJ ou arquivo..."
            value={buscaHistorico}
            onChange={(e) => setBuscaHistorico(e.target.value)}
            className="w-72 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Remessa gerada em</th>
                <th className="px-3 py-2 font-medium">Arquivo</th>
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Favorecido</th>
                <th className="px-3 py-2 font-medium">CPF/CNPJ</th>
                <th className="px-3 py-2 font-medium">Forma</th>
                <th className="px-3 py-2 font-medium">Dados de pagamento</th>
                <th className="px-3 py-2 font-medium">Pagamento em</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {historicoFiltrado.map((i) => (
                <tr key={i.id} className="border-t border-gray-50 align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-600">{formatDataHora(i.geradaEm)}</td>
                  <td className="max-w-[170px] truncate px-3 py-1.5 text-gray-500" title={i.arquivo ?? undefined}>
                    {i.arquivo ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{i.numTit ?? "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5" title={i.favorecidoNome}>
                    {i.favorecidoNome}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-600">{formatarDocumento(i.favorecidoDocumento)}</td>
                  <td className="px-3 py-1.5 text-gray-600">{FORMAS.find((f) => f.valor === i.formaPagamento)?.label ?? i.formaPagamento}</td>
                  <td className="max-w-[260px] break-all px-3 py-1.5 font-mono text-[11px] text-gray-600">{dadosDePagamentoDoHistorico(i)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-500">{formatData(i.dataPagamento)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{formatMoeda(i.valor)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_LABEL[i.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_ITEM_ROTULO[i.status] ?? i.status}
                    </span>
                    {i.baixaSeniorStatus === "ENVIADA" || i.baixaSeniorStatus === "JA_BAIXADO" ? (
                      <span className="ml-1 text-[10px] text-emerald-700" title={i.baixaSeniorMsg ?? "Baixa conferida na Sênior"}>
                        baixado na Senior
                      </span>
                    ) : null}
                    {["EM_PROCESSAMENTO", "INDETERMINADO"].includes(i.baixaSeniorStatus ?? "") && (
                      <span className="ml-1 text-[10px] text-amber-800" title={i.baixaSeniorMsg ?? "Confira o título e a Tesouraria na Sênior antes de repetir a baixa."}>
                        baixa a conferir
                      </span>
                    )}
                    {i.baixaSeniorStatus === "ERRO" && <span className="ml-1 text-[10px] text-red-700" title={i.baixaSeniorMsg ?? undefined}>erro de baixa</span>}
                  </td>
                </tr>
              ))}
              {historicoFiltrado.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-gray-400">
                    {historico.itens.length === 0 ? "Nenhum pagamento gerado ainda." : "Nenhum pagamento encontrado com essa busca."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
