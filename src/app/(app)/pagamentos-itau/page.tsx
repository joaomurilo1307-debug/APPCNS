"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CampoItem, ProblemaItem } from "@/lib/cnab240/itau/validacaoItem";
import type { RelatorioConferencia } from "@/lib/pagamentos/conferenciaRemessa";
import { removerDaSelecaoSalva } from "@/lib/selecaoProgramacao";

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
};

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
  chave: string; // numTit|codFil|codFor pra achar de volta o titulo original
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
};

// Nota 37 do manual: código de 2 dígitos no CNAB. Mesma numeração do TPCPIX
// da Senior ("1" a "4"), só com zero à esquerda.
function tipoChavePixCnab(tpcpix: string | null): "01" | "02" | "03" | "04" | undefined {
  const mapa: Record<string, "01" | "02" | "03" | "04"> = { "1": "01", "2": "02", "3": "03", "4": "04" };
  return tpcpix ? mapa[tpcpix] : undefined;
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
};

type Remessa = {
  id: string;
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

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
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
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [painelBaixa, setPainelBaixa] = useState<{
    remessaId: string;
    arquivo: string;
    numCco: string;
    previa: PreviaBaixa | null;
    carregando: boolean;
    erro: string | null;
  } | null>(null);
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

  function carregarTudo() {
    setLoading(true);
    Promise.all([
      fetch("/api/titulos-pagar").then((r) => r.json()),
      fetch("/api/pagamentos-itau/contas").then((r) => r.json()),
      fetch("/api/pagamentos-itau/remessas").then((r) => r.json()),
    ])
      .then(([tit, cont, rem]) => {
        const titulosAbertos: Titulo[] = (tit.titulos ?? []).filter((t: Titulo) => !t.pago);
        setTitulos(titulosAbertos);
        setContas(cont.contas ?? []);
        setContaSelecionadaId((atual) => atual || (cont.contas ?? [])[0]?.id || "");
        setRemessas(rem.remessas ?? []);

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
            const encontrados = ids.map((id) => porId.get(id)).filter((t): t is Titulo => !!t);
            const itensMontados = encontrados.map((t) => montarItemCarrinho(t));
            setCarrinho((c) => [...c, ...itensMontados]);
            const semForma = itensMontados.filter(semFormaDePagamento);
            if (encontrados.length > 0) {
              setMensagem(
                `${encontrados.length} título(s) trazido(s) da Programação de Pagamento` +
                  (semForma.length > 0
                    ? ` (${semForma.length} sem boleto/conta/PIX na Senior, precisam de dado manual: ${semForma.map((i) => i.numTit).join(", ")}).`
                    : ".")
              );
            }
            if (encontrados.length < ids.length) {
              setErro(`${ids.length - encontrados.length} título(s) selecionado(s) não foram encontrados aqui (já pago ou não sincronizado) e não entraram no carrinho.`);
            }
          } catch {
            // handoff corrompido -- ignora silenciosamente, pessoa so' nao ve o carrinho pre-preenchido
          }
        }
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }

  // Restaura o rascunho ANTES de carregar do servidor, pra não perder o
  // carrinho se a pessoa recarregou a página ou navegou e voltou. A conta
  // escolhida e o carrinho vêm do rascunho; contas/remessas vêm sempre do
  // servidor (são dado compartilhado, não pessoal desta aba).
  useEffect(() => {
    const r = lerRascunho();
    if (r.carrinho?.length) {
      setCarrinho(r.carrinho);
      setMensagem(`Rascunho anterior restaurado: ${r.carrinho.length} item(ns) no carrinho que ainda não tinham virado remessa.`);
    }
    if (r.contaSelecionadaId) setContaSelecionadaId(r.contaSelecionadaId);
    if (r.busca) setBusca(r.busca);
    if (r.vencDe) setVencDe(r.vencDe);
    if (r.vencAte) setVencAte(r.vencAte);
    setRascunhoRestaurado(true);
    carregarTudo();
  }, []);

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
        body: JSON.stringify({ itens: carrinho.map(itemParaApi) }),
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
  }, [rascunhoRestaurado, carrinho]);

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
    const jaNoCarrinho = new Set(carrinho.map((i) => i.chave));
    return titulos
      .filter((t) => !jaNoCarrinho.has(`${t.numTit}|${t.codFil}|${t.codFor}`))
      .filter(
        (t) =>
          !termo || t.numTit.toLowerCase().includes(termo) || t.fornecedorNome.toLowerCase().includes(termo)
      )
      .filter((t) => !vencDe || (t.vencimentoProgramado ?? "").slice(0, 10) >= vencDe)
      .filter((t) => !vencAte || (t.vencimentoProgramado ?? "").slice(0, 10) <= vencAte)
      .slice(0, 200);
  }, [titulos, busca, carrinho, vencDe, vencAte]);

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
      chave: `${t.numTit}|${t.codFil}|${t.codFor}`,
      tituloId: t.id,
      numTit: t.numTit,
      fornecedorNome: t.fornecedorNome,
      favorecidoNome: t.fornecedorNome,
      preenchidoAutomaticamente: false,
      segmento: "A",
      formaPagamento: "01",
      favorecidoTipoDoc: documento.length === 11 ? "1" : "2",
      favorecidoDocumento: documento,
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
    }

    return item;
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
  function adicionarAoCarrinho(t: Titulo) {
    const item = montarItemCarrinho(t);
    if (semFormaDePagamento(item)) {
      const confirmado = window.confirm(`${t.numTit} — ${t.fornecedorNome}\n\n${motivoSemFormaDePagamento(item)}\n\nAdicionar mesmo assim?`);
      if (!confirmado) return;
    }
    setCarrinho((c) => [...c, item]);
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
    if (!contaSelecionadaId || carrinho.length === 0) return;
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
      setCarrinho((c) => c.filter((i) => chavesFicaram.has(i.chave)));
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
      setErro(`Falha de comunicação ao gerar a remessa: ${e.message}. Nada foi gerado.`);
    } finally {
      setGerando(false);
    }
  }

  async function chamarBaixa(confirmar: boolean) {
    if (!painelBaixa) return;
    setPainelBaixa((p) => (p ? { ...p, carregando: true, erro: null } : p));
    try {
      const res = await fetch(`/api/pagamentos-itau/remessas/${painelBaixa.remessaId}/baixa-senior`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar, ...(painelBaixa.numCco.trim() ? { numCcoSenior: painelBaixa.numCco.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao conferir a baixa");
      setPainelBaixa((p) => (p ? { ...p, previa: data, numCco: data.numCco ?? p.numCco, carregando: false } : p));
      if (confirmar) carregarTudo();
    } catch (e: any) {
      setPainelBaixa((p) => (p ? { ...p, carregando: false, erro: e.message } : p));
    }
  }

  function abrirBaixa(r: Remessa) {
    setPainelBaixa({ remessaId: r.id, arquivo: r.nomeArquivo ?? r.id, numCco: r.contaNumCcoSenior ?? "", previa: null, carregando: false, erro: null });
  }

  async function enviarRetorno(file: File) {
    setErro(null);
    setMensagem(null);
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
    const r = data.resumoStatus ?? {};
    setMensagem(
      `Retorno processado: ${data.totalReconhecidos} de ${data.totalLido} pagamento(s) reconhecidos` +
        ` — ${r.PAGO ?? 0} pago(s), ${r.AGENDADO ?? 0} agendado(s), ${r.REJEITADO ?? 0} rejeitado(s), ${r.CANCELADO ?? 0} cancelado(s).` +
        (data.naoReconhecidos.length > 0 ? ` ${data.naoReconhecidos.length} sem correspondência.` : "") +
        (data.prontosParaBaixa > 0
          ? ` ${data.prontosParaBaixa} pronto(s) para baixa na Sênior (botão "Baixar pago(s) na Sênior" na remessa).`
          : (r.AGENDADO ?? 0) > 0
            ? " Os agendados só ficam prontos para baixa no retorno do dia do pagamento."
            : "")
    );
    carregarTudo();
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Pagamentos Itaú (SISPAG)</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
          Gera o arquivo de remessa CNAB240 (padrão SISPAG do Itaú) a partir de títulos em aberto e processa o arquivo de retorno
          para atualizar o status de cada pagamento. Boleto, conta bancária ou chave PIX vêm direto da sincronização com a
          Senior (atualize com o botão abaixo se o título for recente), na prioridade boleto → conta → chave PIX. O Itaú exige o PIX
          em arquivo separado de boleto/TED — o sistema separa sozinho, numa geração só. Antes de gerar, a Conferência mostra o que
          falta em cada título; só gera quando não sobra nenhum problema. Quando tudo vier vazio, é porque a Senior não tem nenhum
          cadastro de pagamento pra esse fornecedor — peça direto a ele.
        </p>
      </div>

      {erro && <div className="mb-4 whitespace-pre-wrap rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</div>}
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
            {relatorio ? (
              relatorio.resumo.comErro === 0 ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  ✓ Tudo certo pra gerar · {relatorio.resumo.total} item(ns) · {formatMoeda(relatorio.resumo.valorTotal)}
                  {relatorio.resumo.comAviso > 0 ? ` · ${relatorio.resumo.comAviso} com aviso` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  ✗ {relatorio.resumo.comErro} de {relatorio.resumo.total} item(ns) com dado faltando ou errado
                </span>
              )
            ) : (
              <span className="text-xs text-gray-400">{conferindo ? "Conferindo…" : "—"}</span>
            )}
          </div>

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
                disabled={gerando || !contaSelecionadaId}
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
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {titulosFiltrados.map((t) => (
                  <tr key={`${t.numTit}-${t.codFil}-${t.codFor}`} className="border-b border-gray-50">
                    <td className="max-w-[110px] truncate px-3 py-1.5 font-medium text-gray-800">{t.numTit}</td>
                    <td className="max-w-[160px] truncate px-3 py-1.5" title={t.fornecedorNome}>
                      {t.fornecedorNome}
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
                        className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand hover:bg-brand/20"
                      >
                        adicionar
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
              disabled={gerando || carrinho.length === 0 || !contaSelecionadaId || (relatorio?.resumo.comErro ?? 0) > 0}
              title={
                (relatorio?.resumo.comErro ?? 0) > 0
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
                            onChange={(e) => atualizarItem(item.chave, { dacFavorecido: e.target.value.replace(/\D/g, "").slice(0, 1) })}
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
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Importar arquivo de retorno
            <input
              type="file"
              accept=".ret,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviarRetorno(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {painelBaixa && (
          <div className="space-y-3 border-b border-gray-100 bg-sky-50/50 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-800">Baixa na Sênior — {painelBaixa.arquivo}</p>
                <p className="text-xs text-gray-500">
                  Cada título é conferido ao vivo na Sênior antes de enviar. Só entram os que o banco confirmou como pagos, ainda abertos na Sênior
                  e com valor pago igual ao em aberto.
                </p>
              </div>
              <button onClick={() => setPainelBaixa(null)} className="text-xs text-gray-500 underline">
                fechar
              </button>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              Conta interna da Sênior (numCco, tela F600CCO):
              <input
                value={painelBaixa.numCco}
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
                    {painelBaixa.previa.jaBaixados.length} já estavam baixados na Sênior. A Programação de Pagamento mostra "Pago" na próxima
                    sincronização com a Sênior (até ~10 min).
                  </p>
                )}
                {painelBaixa.previa.elegiveis.length > 0 && (
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
                {painelBaixa.previa.simulacao && painelBaixa.previa.elegiveis.length > 0 && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Gravar a baixa de ${painelBaixa.previa!.elegiveis.length} título(s), total ${formatMoeda(painelBaixa.previa!.totalElegivel)}, ` +
                            `na conta interna "${painelBaixa.numCco}" da Sênior? Isso escreve no contas a pagar e na tesouraria da Sênior.`
                        )
                      )
                        chamarBaixa(true);
                    }}
                    disabled={painelBaixa.carregando}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Confirmar baixa na Sênior
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
            {remessas.map((r) => (
              <tr key={r.id} className="border-t border-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-800">{r.nomeArquivo ?? "—"}</td>
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
            {remessas.flatMap((r) =>
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
                        title="Mesmo retorno (CNAB240), com quebra de linha CRLF e extensão .REM, pra importar em Finanças > Contas a Pagar > Pagamento Eletrônico > Retorno (F510PRT) na Sênior"
                        className="text-[11px] text-brand underline decoration-dotted underline-offset-2"
                      >
                        baixar p/ Sênior (.REM)
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
            {remessas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma remessa gerada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
