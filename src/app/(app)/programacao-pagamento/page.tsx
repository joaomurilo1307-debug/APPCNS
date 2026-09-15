"use client";

import { useEffect, useMemo, useState } from "react";
import MapaOC, { type Aprovacao, type TituloVinculado } from "@/components/MapaOC";

type OcRelacionada = {
  numOcp: string;
  situacao: string;
  situacaoLabel: string;
  parcela: boolean;
  motivo: string;
  centroCusto?: string | null;
};

type DossieDoTitulo = {
  id: string;
  status: string;
  motivo: string | null;
  temArquivo: boolean;
  numOcp: string | null;
  geradoEm: string;
};

type Titulo = {
  numTit: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string;
  tipo: string;
  situacao: string;
  pago: boolean;
  dataEmissao: string | null;
  vencimentoOriginal: string | null;
  vencimentoProgramado: string | null;
  valorOriginal: number;
  valorAberto: number;
  dataPagamento: string | null;
  ccuNome: string | null;
  ocRelacionada: OcRelacionada | null;
  motivoSemOC: string | null;
  ocEsperada: boolean;
  dossie: DossieDoTitulo | null;
  descricao: string | null;
  dataLancamento: string | null;
  lancadoPorNome: string | null;
  entradaManual: boolean;
  numNfc: string | null;
};

type FiltrosColuna = {
  titulo: string;
  tipo: string;
  criacao: string;
  fornecedor: string;
  centroCusto: string;
  vencimento: string;
  pagamento: string;
  valorOriginal: string;
  valorAberto: string;
  situacao: "" | "pago" | "aberto";
  oc: "" | "com" | "sem" | "sem-investigar" | "justificada" | "exata" | "parcela";
};

const FILTROS_COLUNA_VAZIOS: FiltrosColuna = {
  titulo: "",
  tipo: "",
  criacao: "",
  fornecedor: "",
  centroCusto: "",
  vencimento: "",
  pagamento: "",
  valorOriginal: "",
  valorAberto: "",
  situacao: "",
  oc: "",
};

// yyyy-mm-dd (valor de <input type="date">) comparado com um ISO -- ambos
// tratados como dia civil, sem hora, pra não "vazar" 1 dia por fuso.
function dataDentroDoIntervalo(iso: string | null, de: string, ate: string) {
  if (!iso) return false;
  const dia = iso.slice(0, 10);
  if (de && dia < de) return false;
  if (ate && dia > ate) return false;
  return true;
}

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function horasDesde(iso: string | null) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

const MOTIVO_PADRAO: Record<string, string> = {
  SEM_OC: "A automação não localizou a OC deste título",
  OC_NAO_QUITADA: "A OC existe, mas ainda tem título em aberto",
  ERRO: "A geração do dossiê falhou",
};

// Sentinela de "sem data" do Senior aparecendo como data real. Confirmado
// 14/09/2026: 33 títulos em aberto vêm com vencimento 30 ou 31/12/2030, e o
// ERP diz o mesmo -- é cadastro, não erro de sincronismo. Sem marcar, eles
// nunca caem em nenhuma semana e ficam invisíveis pra sempre na conferência.
function vencimentoSentinela(iso: string | null) {
  if (!iso) return false;
  const dia = iso.slice(0, 10);
  const [ano, mes, d] = dia.split("-").map(Number);
  if (ano <= 1950) return true;
  return ano >= 2030 && mes === 12 && d >= 28;
}

function textoContem(valor: string | null | undefined, filtro: string) {
  return !filtro || (valor ?? "").toLocaleLowerCase().includes(filtro.trim().toLocaleLowerCase());
}

function valorContem(valor: number, filtro: string) {
  if (!filtro.trim()) return true;
  const termo = filtro.trim().toLocaleLowerCase();
  return (
    formatMoeda(valor).toLocaleLowerCase().includes(termo) ||
    valor.toFixed(2).includes(termo.replace(",", "."))
  );
}

function dataIgual(iso: string | null, filtro: string) {
  return !filtro || (!!iso && iso.slice(0, 10) === filtro);
}

// Semana atual (segunda a domingo), no fuso do navegador -- usada só pro
// filtro "Semana atual", comparando com o dia (sem hora) de cada título.
function semanaAtual() {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=domingo
  const deltaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deltaSegunda);
  const domingo = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + 6);
  return { inicio: segunda, fim: domingo };
}

function dentroDaSemana(iso: string | null, inicio: Date, fim: Date) {
  if (!iso) return false;
  const d = new Date(iso);
  const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dUTC >= inicio && dUTC <= fim;
}

type Filtro = "semana" | "aberto" | "pagos" | "todos";

const ABAS: [Filtro, string][] = [
  ["semana", "Semana atual"],
  ["aberto", "Em aberto"],
  ["pagos", "Histórico (pagos)"],
  ["todos", "Todos"],
];

export default function ProgramacaoPagamentoPage() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("semana");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [somenteComOC, setSomenteComOC] = useState(false);
  const [mostrarRegras, setMostrarRegras] = useState(false);
  const [filtrosColuna, setFiltrosColuna] = useState<FiltrosColuna>(FILTROS_COLUNA_VAZIOS);
  const [ocAberta, setOcAberta] = useState<Aprovacao | null>(null);
  const [titulosDaOC, setTitulosDaOC] = useState<TituloVinculado[]>([]);
  const [codToNomeOC, setCodToNomeOC] = useState<Record<string, string>>({});
  const [carregandoOC, setCarregandoOC] = useState<string | null>(null);
  const [erroOC, setErroOC] = useState<string | null>(null);

  function abrirOC(numOcp: string) {
    setCarregandoOC(numOcp);
    setErroOC(null);
    fetch(`/api/senior/aprovacoes/${numOcp}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar a OC");
        }
        return res.json();
      })
      .then((data) => {
        setOcAberta(data.aprovacao);
        setCodToNomeOC(data.codToNome ?? {});
        setTitulosDaOC(data.titulosVinculados ?? []);
      })
      .catch((e) => setErroOC(e.message))
      .finally(() => setCarregandoOC(null));
  }
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [totalAberto, setTotalAberto] = useState(0);
  const [qtdAberto, setQtdAberto] = useState(0);
  const [qtdPagos, setQtdPagos] = useState(0);
  const [totalPago, setTotalPago] = useState(0);

  useEffect(() => {
    fetch("/api/titulos-pagar")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar");
        }
        return res.json();
      })
      .then((data) => {
        setTitulos(data.titulos);
        setSincronizadoEm(data.sincronizadoEm ?? null);
        setTotalAberto(data.totalAberto ?? 0);
        setQtdAberto(data.qtdAberto ?? 0);
        setQtdPagos(data.qtdPagos ?? 0);
        setTotalPago(data.totalPago ?? 0);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  const { inicio: inicioSemana, fim: fimSemana } = useMemo(() => semanaAtual(), []);

  const qtdSemana = useMemo(
    () => titulos.filter((t) => !t.pago && dentroDaSemana(t.vencimentoProgramado, inicioSemana, fimSemana)).length,
    [titulos, inicioSemana, fimSemana]
  );
  const mostrarColunaPagamento = filtro === "pagos" || filtro === "todos";

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return titulos
      .filter((t) => {
        if (filtro === "semana") return !t.pago && dentroDaSemana(t.vencimentoProgramado, inicioSemana, fimSemana);
        if (filtro === "aberto") return !t.pago;
        if (filtro === "pagos") return t.pago;
        return true;
      })
      .filter(
        (t) =>
          !termo ||
          t.numTit.toLowerCase().includes(termo) ||
          t.fornecedorNome.toLowerCase().includes(termo) ||
          (t.ccuNome ?? "").toLowerCase().includes(termo) ||
          (t.tipo ?? "").toLowerCase().includes(termo) ||
          (t.ocRelacionada?.numOcp ?? "").toLowerCase().includes(termo) ||
          (t.motivoSemOC ?? "").toLowerCase().includes(termo)
      )
      .filter((t) => (!dataDe && !dataAte) || dataDentroDoIntervalo(t.vencimentoProgramado, dataDe, dataAte))
      .filter((t) => !somenteComOC || !!t.ocRelacionada)
      .filter((t) => {
        const f = filtrosColuna;
        if (!textoContem(t.numTit, f.titulo)) return false;
        if (!textoContem(t.tipo, f.tipo)) return false;
        if (!dataIgual(t.dataEmissao, f.criacao)) return false;
        if (!textoContem(t.fornecedorNome, f.fornecedor)) return false;
        if (!textoContem(t.ccuNome, f.centroCusto)) return false;
        if (!dataIgual(t.vencimentoProgramado, f.vencimento)) return false;
        if (mostrarColunaPagamento && !dataIgual(t.dataPagamento, f.pagamento)) return false;
        if (!valorContem(t.valorOriginal, f.valorOriginal)) return false;
        if (!valorContem(t.valorAberto, f.valorAberto)) return false;
        if (f.situacao === "pago" && !t.pago) return false;
        if (f.situacao === "aberto" && t.pago) return false;
        if (f.oc === "com" && !t.ocRelacionada) return false;
        if (f.oc === "sem" && t.ocRelacionada) return false;
        if (f.oc === "sem-investigar" && (t.ocRelacionada || !t.ocEsperada)) return false;
        if (f.oc === "justificada" && (t.ocRelacionada || t.ocEsperada)) return false;
        if (f.oc === "exata" && (!t.ocRelacionada || t.ocRelacionada.parcela)) return false;
        if (f.oc === "parcela" && (!t.ocRelacionada || !t.ocRelacionada.parcela)) return false;
        return true;
      })
      .sort((a, b) => {
        if (filtro === "semana") return (a.vencimentoProgramado || "").localeCompare(b.vencimentoProgramado || "");
        if (filtro === "pagos") return (b.dataPagamento || "").localeCompare(a.dataPagamento || ""); // pago mais recente primeiro
        return (b.dataEmissao || "").localeCompare(a.dataEmissao || ""); // aberto/todos: criado mais recente primeiro
      });
  }, [titulos, busca, filtro, inicioSemana, fimSemana, dataDe, dataAte, somenteComOC, filtrosColuna, mostrarColunaPagamento]);

  // "Pagos"/"Todos" podem ter milhares de linhas -- renderiza só as N mais
  // relevantes por vez (a busca ainda filtra sobre o conjunto inteiro).
  const LIMITE_LINHAS = 500;
  const totalFiltrado = filtrados.length;
  const filtradosMostrados = filtrados.slice(0, LIMITE_LINHAS);
  const filtrosPorColunaAtivos = Object.values(filtrosColuna).some(Boolean);
  const qtdSemOCEsperada = titulos.filter((t) => !t.ocRelacionada && !t.ocEsperada).length;
  const qtdSemOCInvestigar = titulos.filter((t) => !t.ocRelacionada && t.ocEsperada).length;

  function atualizarFiltroColuna<K extends keyof FiltrosColuna>(campo: K, valor: FiltrosColuna[K]) {
    setFiltrosColuna((anterior) => ({ ...anterior, [campo]: valor }));
  }

  function limparFiltros() {
    setBusca("");
    setDataDe("");
    setDataAte("");
    setSomenteComOC(false);
    setFiltrosColuna(FILTROS_COLUNA_VAZIOS);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Programação de Pagamento</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
            Contas a pagar por título (histórico completo), sincronizado do Senior. O vínculo com OC é demonstrado por número exato,
            parcela confirmada ou conciliação única — quando não houver OC, o motivo aparece no campo “OC”.
          </p>
          {sincronizadoEm && (
            <p
              className={`mt-1 text-[11px] ${
                (horasDesde(sincronizadoEm) ?? 0) > 24 ? "font-medium text-amber-700" : "text-gray-400"
              }`}
              title={
                (horasDesde(sincronizadoEm) ?? 0) > 24
                  ? "O Senior pode ter reprogramado vencimentos depois desta sincronização — confira a data antes de decidir pagamento."
                  : undefined
              }
            >
              Sincronizado do Senior em {formatDataHora(sincronizadoEm)}
              {(horasDesde(sincronizadoEm) ?? 0) > 24 &&
                ` · ${Math.floor((horasDesde(sincronizadoEm) ?? 0) / 24)} dia(s) atrás`}
            </p>
          )}
        </div>
        <button
          onClick={() => setMostrarRegras((v) => !v)}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {mostrarRegras ? "Ocultar regras" : "Quando um título tem (ou não) OC?"}
        </button>
      </div>

      {mostrarRegras && (
        <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4 text-sm shadow-sm">
          <p className="mb-2 font-semibold text-gray-700">Como o vínculo com a OC é decidido (em ordem de prioridade)</p>
          <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-gray-600">
            <li><span className="font-medium text-gray-700">Vínculo direto:</span> o próprio título traz o número da OC (E501TCP.NUMOCP) — quando o Senior grava essa relação, é a mais confiável.</li>
            <li><span className="font-medium text-gray-700">Vínculo exato:</span> a OC tem, num campo de texto livre preenchido pelo comprador (USU_NUMTIT ou USU_NUMNFC), o mesmo número do título ou da nota fiscal, para o mesmo fornecedor.</li>
            <li><span className="font-medium text-gray-700">Vínculo por parcela:</span> o título é uma parcela de uma NF (ex. “8327785$08”) e a OC referencia a mesma base numérica (ex. “8327785$01”) — o comprador só costuma anotar a 1ª parcela.</li>
            <li><span className="font-medium text-gray-700">Fornecedor + valor + data, sozinhos, nunca criam vínculo</span> — isso não existe como relação no Senior; serve só para explicar a pendência (mostrado no motivo de “Sem OC”), nunca vira uma OC vinculada.</li>
          </ol>
          <p className="mb-2 font-semibold text-gray-700">Quando um título não deveria ter OC (por natureza)</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-gray-600">
            <li>Tipo <span className="font-medium">PRV</span> (previsão/provisão) — lançamento recorrente (contas de consumo, assinaturas, impostos previstos) sem compra de fornecedor por trás.</li>
            <li>Tipo <span className="font-medium">IMP</span> (imposto) e títulos <span className="font-medium">FOPAG</span> (folha de pagamento) — pagamento a governo ou colaborador, nunca passa por Ordem de Compra.</li>
            <li>Fornecedor claramente governo/folha (Receita Federal, INSS, FGTS, prefeitura, Caixa Econômica, fornecedores diversos de folha, etc.).</li>
          </ul>
          <p className="mb-2 font-semibold text-gray-700">Filtros da coluna “OC”</p>
          <ul className="list-disc space-y-1 pl-5 text-gray-600">
            <li><span className="font-medium text-gray-700">sem OC (investigar):</span> título de fornecedor comum, sem nenhuma das exclusões acima, mas sem vínculo encontrado — candidato real a checar no Senior.</li>
            <li><span className="font-medium text-gray-700">sem OC justificada:</span> não achou vínculo, mas o motivo já é conhecido e aceito (tipo por natureza, ou uma exceção confirmada manualmente no Senior — ex. um título específico que realmente não teve OC gerada).</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Dica:</span> pra ver título não pago com OC já aprovada (útil pra cobrar pagamento atrasado), combine o filtro
            de Situação = “Não pago” com o filtro de OC = “vínculo exato” ou “por parcela” e confira a cor do badge na coluna OC (verde = aprovada).
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
          {ABAS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 whitespace-nowrap transition-colors ${
                filtro === v ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
              {v === "semana" ? ` (${qtdSemana})` : ""}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {filtro === "semana" && !dataDe && !dataAte && (
            <span className="text-xs text-gray-400">
              {formatData(inicioSemana.toISOString())} – {formatData(fimSemana.toISOString())}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Vencto de</span>
            <input
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            {(dataDe || dataAte) && (
              <button
                onClick={() => {
                  setDataDe("");
                  setDataAte("");
                }}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                limpar
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={somenteComOC} onChange={(e) => setSomenteComOC(e.target.checked)} />
            só com OC vinculada
          </label>
          <input
            type="text"
            placeholder="Buscar título, fornecedor ou nº da OC..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          {(busca || dataDe || dataAte || somenteComOC || filtrosPorColunaAtivos) && (
            <button onClick={limparFiltros} className="text-xs text-gray-400 underline hover:text-gray-600">
              limpar todos os filtros
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Vence esta semana</p>
          <p className="text-xl font-semibold tabular-nums">{qtdSemana}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Em aberto</p>
          <p className="text-xl font-semibold tabular-nums">
            {qtdAberto} <span className="text-sm font-normal text-gray-400">· {formatMoeda(totalAberto)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Pagos (histórico completo)</p>
          <p className="text-xl font-semibold tabular-nums">
            {qtdPagos} <span className="text-sm font-normal text-gray-400">· {formatMoeda(totalPago)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Mostrando</p>
          <p className="text-xl font-semibold tabular-nums">
            {filtradosMostrados.length}
            {totalFiltrado > LIMITE_LINHAS && <span className="text-sm font-normal text-gray-400"> de {totalFiltrado}</span>}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Sem OC a investigar</p>
          <p className="text-xl font-semibold tabular-nums">{qtdSemOCInvestigar}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">Sem OC justificada: {qtdSemOCEsperada}</p>
        </div>
      </div>

      {totalFiltrado > LIMITE_LINHAS && (
        <p className="mb-2 text-xs text-gray-400">
          {LIMITE_LINHAS} de {totalFiltrado} linhas — use a busca pra achar um título específico.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">OC</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Criação</th>
              <th className="px-3 py-2 font-medium">Lançado no Senior</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Centro de custo</th>
              <th className="px-3 py-2 font-medium">Vencto programado</th>
              {mostrarColunaPagamento && <th className="px-3 py-2 font-medium">Pago em</th>}
              <th className="px-3 py-2 text-right font-medium">Valor original</th>
              <th className="px-3 py-2 text-right font-medium">Valor em aberto</th>
              <th className="px-3 py-2 font-medium">Situação</th>
            </tr>
            <tr className="border-t border-gray-200 bg-white align-top">
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar título"
                  type="text"
                  placeholder="filtrar..."
                  value={filtrosColuna.titulo}
                  onChange={(e) => atualizarFiltroColuna("titulo", e.target.value)}
                  className="w-full min-w-[90px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <select
                  aria-label="Filtrar vínculo com OC"
                  value={filtrosColuna.oc}
                  onChange={(e) => atualizarFiltroColuna("oc", e.target.value as FiltrosColuna["oc"])}
                  className="w-full min-w-[125px] rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                >
                  <option value="">todos</option>
                  <option value="com">com OC</option>
                  <option value="sem">sem OC</option>
                  <option value="sem-investigar">sem OC (investigar)</option>
                  <option value="justificada">sem OC justificada</option>
                  <option value="exata">vínculo exato</option>
                  <option value="parcela">por parcela</option>
                </select>
              </th>
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar tipo"
                  type="text"
                  placeholder="tipo..."
                  value={filtrosColuna.tipo}
                  onChange={(e) => atualizarFiltroColuna("tipo", e.target.value)}
                  className="w-full min-w-[65px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar data de criação"
                  type="date"
                  value={filtrosColuna.criacao}
                  onChange={(e) => atualizarFiltroColuna("criacao", e.target.value)}
                  className="w-full min-w-[125px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2" />
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar fornecedor"
                  type="text"
                  placeholder="fornecedor..."
                  value={filtrosColuna.fornecedor}
                  onChange={(e) => atualizarFiltroColuna("fornecedor", e.target.value)}
                  className="w-full min-w-[150px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar centro de custo"
                  type="text"
                  placeholder="centro..."
                  value={filtrosColuna.centroCusto}
                  onChange={(e) => atualizarFiltroColuna("centroCusto", e.target.value)}
                  className="w-full min-w-[120px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar vencimento programado"
                  type="date"
                  value={filtrosColuna.vencimento}
                  onChange={(e) => atualizarFiltroColuna("vencimento", e.target.value)}
                  className="w-full min-w-[125px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              {mostrarColunaPagamento && (
                <th className="px-2 py-2">
                  <input
                    aria-label="Filtrar data de pagamento"
                    type="date"
                    value={filtrosColuna.pagamento}
                    onChange={(e) => atualizarFiltroColuna("pagamento", e.target.value)}
                    className="w-full min-w-[125px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                  />
                </th>
              )}
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar valor original"
                  type="text"
                  placeholder="valor..."
                  value={filtrosColuna.valorOriginal}
                  onChange={(e) => atualizarFiltroColuna("valorOriginal", e.target.value)}
                  className="w-full min-w-[100px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar valor em aberto"
                  type="text"
                  placeholder="valor..."
                  value={filtrosColuna.valorAberto}
                  onChange={(e) => atualizarFiltroColuna("valorAberto", e.target.value)}
                  className="w-full min-w-[100px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <select
                  aria-label="Filtrar situação"
                  value={filtrosColuna.situacao}
                  onChange={(e) => atualizarFiltroColuna("situacao", e.target.value as FiltrosColuna["situacao"])}
                  className="w-full min-w-[100px] rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                >
                  <option value="">todas</option>
                  <option value="aberto">Não pago</option>
                  <option value="pago">Pago</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtradosMostrados.map((t, i) => (
              <tr key={`${t.numTit}-${t.codFil}-${t.dataEmissao}`} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                <td className="px-3 py-1.5 font-medium text-gray-800">
                  {t.dossie?.temArquivo ? (
                    <a
                      href={`/api/dossies/${t.dossie.id}/arquivo`}
                      target="_blank"
                      rel="noreferrer"
                      title={`Abrir o dossiê${t.dossie.numOcp ? ` da OC ${t.dossie.numOcp}` : ""} — gerado em ${formatDataHora(t.dossie.geradoEm)}`}
                      className="text-brand underline decoration-dotted underline-offset-2 hover:brightness-95"
                    >
                      {t.numTit}
                    </a>
                  ) : (
                    <span
                      title={
                        t.dossie
                          ? t.dossie.motivo ?? MOTIVO_PADRAO[t.dossie.status] ?? "Dossiê registrado sem documento"
                          : "Nenhum dossiê gerado para este título ainda"
                      }
                      className={t.dossie ? "cursor-help decoration-dotted underline-offset-2 [text-decoration-line:underline]" : undefined}
                    >
                      {t.numTit}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {t.ocRelacionada ? (
                    <button
                      onClick={() => abrirOC(t.ocRelacionada!.numOcp)}
                      disabled={carregandoOC === t.ocRelacionada.numOcp}
                      title={
                        `${t.ocRelacionada.motivo} Clique para ver o descritivo da OC.`
                      }
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium underline decoration-dotted underline-offset-2 hover:brightness-95 disabled:opacity-50 ${
                        t.ocRelacionada.situacao === "APR"
                          ? "bg-emerald-100 text-emerald-800"
                          : t.ocRelacionada.situacao === "REP" || t.ocRelacionada.situacao === "CAN"
                            ? "bg-red-100 text-red-700"
                            : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      OC {t.ocRelacionada.numOcp} · {t.ocRelacionada.situacaoLabel} ·{" "}
                      {t.ocRelacionada.parcela ? "parcela" : "exata"}
                      {carregandoOC === t.ocRelacionada.numOcp && "…"}
                    </button>
                  ) : (
                    <details className="max-w-[230px]">
                      <summary className="cursor-help rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 underline decoration-dotted underline-offset-2">
                        Sem OC · por quê?
                      </summary>
                      <p className="mt-1 text-[10px] leading-tight text-gray-500">
                        {t.motivoSemOC || "Sem motivo de vínculo informado."}
                      </p>
                    </details>
                  )}
                </td>
                <td className="px-3 py-1.5 text-gray-500">{t.tipo}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(t.dataEmissao)}</td>
                <td className="max-w-[160px] px-3 py-1.5 text-gray-500">
                  <span
                    className="cursor-help underline decoration-dotted underline-offset-2"
                    title={[
                      `Lançado por ${t.lancadoPorNome || "usuário não identificado"} (E501TCP.USUGER) em ${formatData(t.dataLancamento)} (E501TCP.DATGER).`,
                      t.entradaManual
                        ? "Lançamento manual, sem nota fiscal de compra vinculada (E501TCP.NUMNFC = 0)."
                        : `Gerado automaticamente pela Nota Fiscal de Compra ${t.numNfc} (E501TCP.NUMNFC).`,
                      t.descricao ? `\nDescrição (E501TCP.OBSTCP): ${t.descricao}` : "",
                    ].join(" ")}
                  >
                    {t.lancadoPorNome || "—"}
                  </span>
                  <span
                    className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      t.entradaManual ? "bg-gray-100 text-gray-500" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {t.entradaManual ? "manual" : "NF"}
                  </span>
                  {t.dataLancamento && <span className="block text-[10px] text-gray-400">em {formatData(t.dataLancamento)}</span>}
                </td>
                <td className="max-w-[200px] truncate px-3 py-1.5" title={t.fornecedorNome}>
                  {t.fornecedorNome}
                </td>
                <td className="px-3 py-1.5 text-gray-500">
                  {t.ccuNome ? (
                    t.ccuNome
                  ) : (
                    <span className="cursor-help underline decoration-dotted underline-offset-2" title="O título não trouxe CC no sincronismo do rateio E501RAT.">
                      Sem CC
                    </span>
                  )}
                  {!t.ccuNome && t.ocRelacionada?.centroCusto && (
                    <span className="mt-0.5 block text-[10px] text-gray-400">OC: {t.ocRelacionada.centroCusto}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">
                  {formatData(t.vencimentoProgramado)}
                  {vencimentoSentinela(t.vencimentoProgramado) && (
                    <span
                      className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                      title="Data de preenchimento do Senior, não um vencimento real — este título não vai aparecer em nenhuma semana até ser corrigido no ERP."
                    >
                      sem data real
                    </span>
                  )}
                </td>
                {mostrarColunaPagamento && (
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(t.dataPagamento)}</td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoeda(t.valorOriginal)}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatMoeda(t.valorAberto)}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      t.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t.pago ? "Pago" : "Não pago"}
                  </span>
                </td>
              </tr>
            ))}
            {filtradosMostrados.length === 0 && (
              <tr>
                <td colSpan={mostrarColunaPagamento ? 13 : 12} className="px-4 py-6 text-center text-gray-400">
                  Nenhum título encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {erroOC && (
        <div
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg"
          onClick={() => setErroOC(null)}
        >
          {erroOC} (clique pra fechar)
        </div>
      )}
      {ocAberta && (
        <MapaOC aprovacao={ocAberta} codToNome={codToNomeOC} titulosVinculados={titulosDaOC} onClose={() => setOcAberta(null)} />
      )}
    </div>
  );
}
