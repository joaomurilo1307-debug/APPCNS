"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [gerando, setGerando] = useState(false);
  const [mostrarFormConta, setMostrarFormConta] = useState(false);
  const [novaConta, setNovaConta] = useState({ apelido: "", cnpj: "", agencia: "", conta: "", dac: "" });
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagemSync, setMensagemSync] = useState<string | null>(null);
  const [vencDe, setVencDe] = useState("");
  const [vencAte, setVencAte] = useState("");
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);

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
        const pendente = sessionStorage.getItem("handoffRemessaItau");
        if (pendente) {
          sessionStorage.removeItem("handoffRemessaItau");
          try {
            const ids: string[] = JSON.parse(pendente);
            const porId = new Map(titulosAbertos.map((t) => [t.id, t]));
            const encontrados = ids.map((id) => porId.get(id)).filter((t): t is Titulo => !!t);
            for (const t of encontrados) adicionarAoCarrinho(t);
            if (encontrados.length > 0) {
              setMensagem(`${encontrados.length} título(s) trazido(s) da Programação de Pagamento.`);
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

  function adicionarAoCarrinho(t: Titulo) {
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

  async function gerarRemessa() {
    if (!contaSelecionadaId || carrinho.length === 0) return;
    setGerando(true);
    setErro(null);
    setMensagem(null);
    try {
      const res = await fetch("/api/pagamentos-itau/remessas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contaBancariaId: contaSelecionadaId,
          itens: carrinho.map((i) => ({
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
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.titulosSemOC) && data.titulosSemOC.length > 0) {
          const lista = data.titulosSemOC
            .map((t: any) => `• ${t.numTit} (${t.fornecedor}, ${formatMoeda(t.valor)}): ${t.motivo}`)
            .join("\n");
          throw new Error(`${data.error}\n\n${lista}\n\nResolva o vínculo na Programação de Pagamento antes de gerar a remessa.`);
        }
        if (Array.isArray(data.titulosBloqueados) && data.titulosBloqueados.length > 0) {
          const lista = data.titulosBloqueados
            .map((t: any) => `• ${t.numTit} (${t.fornecedor}, ${formatMoeda(t.valor)}): situação "${t.situacao}" no Senior`)
            .join("\n");
          throw new Error(
            `${data.error}\n\n${lista}\n\nPodem já estar comprometidos em outro fluxo de pagamento do Senior -- remova-os do carrinho.`
          );
        }
        throw new Error(data.error || "Erro ao gerar remessa");
      }
      setMensagem(`Remessa gerada com ${carrinho.length} pagamento(s), total ${formatMoeda(carrinho.reduce((s, i) => s + i.valor, 0))}.`);
      setCarrinho([]);
      carregarTudo();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setGerando(false);
    }
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
    setMensagem(
      `Retorno processado: ${data.totalReconhecidos} de ${data.totalLido} pagamento(s) reconhecidos.` +
        (data.naoReconhecidos.length > 0 ? ` ${data.naoReconhecidos.length} sem correspondência.` : "")
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
          Senior (atualize com o botão abaixo se o título for recente), na prioridade boleto → conta → chave PIX. PIX via chave
          exige remessa separada de boleto/TED (exigência do próprio manual do banco — gere em arquivos diferentes). Quando tudo
          vier vazio, é porque a Senior não tem nenhum cadastro de pagamento pra esse fornecedor — peça direto a ele.
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
              onClick={gerarRemessa}
              disabled={gerando || carrinho.length === 0 || !contaSelecionadaId}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {gerando ? "Gerando..." : "Gerar remessa"}
            </button>
          </div>
          <div className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto">
            {carrinho.map((item) => {
              const formaInfo = FORMAS.find((f) => f.valor === item.formaPagamento)!;
              return (
                <div key={item.chave} className="p-3">
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
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
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
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                      />
                    </label>
                    <label>
                      CPF/CNPJ favorecido
                      <input
                        value={item.favorecidoDocumento}
                        onChange={(e) => atualizarItem(item.chave, { favorecidoDocumento: e.target.value })}
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
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
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                      />
                    </label>
                    <label>
                      Data de pagamento
                      <input
                        type="date"
                        value={item.dataPagamento}
                        onChange={(e) => atualizarItem(item.chave, { dataPagamento: e.target.value })}
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                      />
                    </label>

                    {formaInfo.segmento === "J" ? (
                      <label className="col-span-2">
                        Código de barras / linha digitável do boleto
                        <input
                          value={item.codigoBarras}
                          onChange={(e) => atualizarItem(item.chave, { codigoBarras: e.target.value })}
                          placeholder="44 ou 47 dígitos"
                          className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                        />
                      </label>
                    ) : item.formaPagamento === "45" && !item.bancoFavorecido ? (
                      // PIX no modelo "Chave" (Nota 37 do manual): não tem conta bancária
                      // real do favorecido, só a chave -- é o Segmento B que carrega isso,
                      // não o banco/agência/conta do Segmento A.
                      <>
                        <label>
                          Tipo de chave
                          <select
                            value={item.chavePixTipo ?? ""}
                            onChange={(e) => atualizarItem(item.chave, { chavePixTipo: e.target.value as ItemCarrinho["chavePixTipo"] })}
                            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
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
                            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            atualizarItem(item.chave, {
                              formaPagamento: "01",
                              chavePixTipo: undefined,
                              chavePixValor: undefined,
                            })
                          }
                          className="col-span-2 text-left text-[11px] text-brand underline"
                        >
                          Tenho a conta bancária real desse favorecido — usar TED/crédito em vez de PIX
                        </button>
                      </>
                    ) : (
                      <>
                        <label>
                          Banco favorecido
                          <input
                            value={item.bancoFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { bancoFavorecido: e.target.value.replace(/\D/g, "") })}
                            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                          />
                        </label>
                        <label>
                          Agência
                          <input
                            value={item.agenciaFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { agenciaFavorecido: e.target.value.replace(/\D/g, "") })}
                            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                          />
                        </label>
                        <label>
                          Conta
                          <input
                            value={item.contaFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { contaFavorecido: e.target.value.replace(/\D/g, "") })}
                            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
                          />
                        </label>
                        <label>
                          DAC
                          <input
                            value={item.dacFavorecido}
                            onChange={(e) => atualizarItem(item.chave, { dacFavorecido: e.target.value.replace(/\D/g, "").slice(0, 1) })}
                            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1"
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
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoeda(r.totalValor)}</td>
                <td className="px-3 py-1.5 text-right">
                  <a href={`/api/pagamentos-itau/remessas/${r.id}/arquivo`} className="text-xs text-brand underline">
                    baixar .rem
                  </a>
                </td>
              </tr>
            ))}
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
