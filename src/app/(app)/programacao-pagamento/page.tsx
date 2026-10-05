"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import MapaOC, { type Aprovacao, type TituloVinculado } from "@/components/MapaOC";

const REVISAO_LABEL: Record<string, string> = {
  APROVADO: "Aprovado",
  CORRIGIDO: "Corrigido",
  SEM_OC_CONFIRMADO: "Sem OC (confirmado)",
  AGUARDANDO_COMPRAS: "Aguardando compras",
  // 01/10/2026: pagamento ja' foi enviado ao banco, mas o Senior ainda nao
  // tem a baixa lancada (confirmado na fonte: VLRABE continua positivo,
  // ULTPGT vazio) -- "Não pago" continua tecnicamente certo (vem so' do
  // Senior, nunca forcado por aqui), isso so' evita confundir "ja mandei,
  // falta so' a baixa" com um backlog esquecido de verdade.
  ENVIADO_AGUARDANDO_BAIXA: "Enviado (aguarda baixa Senior)",
};
const REVISAO_COR: Record<string, string> = {
  APROVADO: "bg-brand text-white",
  CORRIGIDO: "bg-emerald-100 text-emerald-800",
  SEM_OC_CONFIRMADO: "bg-gray-200 text-gray-700",
  AGUARDANDO_COMPRAS: "bg-amber-100 text-amber-800",
  ENVIADO_AGUARDANDO_BAIXA: "bg-sky-100 text-sky-800",
};

// Achado 30/09/2026: o Senior tem 7 status de título (AB, LQ, CA, PE, AV,
// LS, LV), mas o sync só trazia AB/LQ -- título que o Senior movia pra
// qualquer outro status sumia da fonte e era apagado do nosso banco (ex:
// Fort Minas 1765$01/2071$01/2072$01/2072$02, achados via CODTNS=90501 no
// E501MCP). Agora o sync traz todos, e aqui eles ficam visíveis mas
// travados pra remessa -- podem já estar comprometidos em outro fluxo de
// pagamento do próprio Senior, incluir de novo arriscaria pagar em dobro.
const SITUACAO_ESPECIAL_LABEL: Record<string, string> = {
  CA: "Cancelado no Senior",
  PE: "Situação especial no Senior (PE)",
  AV: "Situação especial no Senior (AV)",
  LS: "Situação especial no Senior (LS)",
  LV: "Situação especial no Senior (LV)",
};
function situacaoEspecial(t: Pick<Titulo, "situacao" | "pago">) {
  return !t.pago && t.situacao !== "AB";
}
function labelSituacaoEspecial(situacao: string) {
  return SITUACAO_ESPECIAL_LABEL[situacao] || `Situação especial no Senior (${situacao})`;
}

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
  id: string;
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
  codFpg: string | null;
  formaPagamento: string | null;
  revisadoStatus: string | null;
  revisadoPorNome: string | null;
  revisadoEm: string | null;
  revisadoObs: string | null;
  numOcpCorrigido: string | null;
};

type FiltrosColuna = {
  titulo: string;
  tipo: string;
  criacao: string;
  fornecedor: string;
  codFpg: string;
  formaPagamento: string;
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
  codFpg: "",
  formaPagamento: "",
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

function minutosDesde(iso: string | null) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 60000;
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
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
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
  // Resultado do e-mail de retorno pro criador da OC (ao aprovar um titulo).
  const [avisoEmail, setAvisoEmail] = useState<{ ok: boolean; texto: string } | null>(null);

  // Painel "OCs programadas": pedido do João 01/10/2026 depois de uma
  // auditoria manual achar 15 OCs com título real no Senior mas sem o
  // vínculo confirmado (algumas com o vencimento do título desatualizado,
  // diferente da previsão de pagamento real da OC -- E420OCP.USU_DATVECT).
  // Mostra, pra um intervalo de datas, toda OC com previsão de pagamento
  // nesse período e o motivo de cada uma estar ou não pronta pra entrar
  // aqui -- o mesmo diagnóstico que antes só dava pra fazer manualmente.
  const [mostrarProgramadas, setMostrarProgramadas] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [progDe, setProgDe] = useState(hoje);
  const [progAte, setProgAte] = useState(amanha);
  const [carregandoProg, setCarregandoProg] = useState(false);
  const [erroProg, setErroProg] = useState<string | null>(null);
  const [dadosProg, setDadosProg] = useState<{
    resumo: Record<string, number>;
    ocs: Array<{
      numOcp: string;
      fornecedorNome: string | null;
      valor: number;
      previsaoPagamento: string | null;
      status: "vinculado" | "candidato_pendente" | "sem_titulo" | "em_aprovacao" | "indeterminado";
      detalhe: string;
      titulo?: { numTit: string; valorAberto: number; vencimentoProgramado: string | null };
      situacaoLabel?: string;
    }>;
  } | null>(null);

  function carregarProgramadas() {
    setCarregandoProg(true);
    setErroProg(null);
    fetch(`/api/senior/aprovacoes/programadas?de=${progDe}&ate=${progAte}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar OCs programadas");
        }
        return res.json();
      })
      .then((data) => setDadosProg(data))
      .catch((e) => setErroProg(e.message))
      .finally(() => setCarregandoProg(false));
  }

  useEffect(() => {
    if (mostrarProgramadas) carregarProgramadas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarProgramadas, progDe, progAte]);

  const PROG_STATUS: Record<string, { label: string; cor: string }> = {
    vinculado: { label: "Já vinculada", cor: "bg-emerald-100 text-emerald-800" },
    candidato_pendente: { label: "Título existe, falta confirmar", cor: "bg-amber-100 text-amber-800" },
    sem_titulo: { label: "Sem título no Senior ainda", cor: "bg-gray-200 text-gray-700" },
    em_aprovacao: { label: "Em aprovação na Senior", cor: "bg-sky-100 text-sky-800" },
    indeterminado: { label: "Precisa checar manualmente", cor: "bg-red-100 text-red-700" },
  };

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
  const [sincronizando, setSincronizando] = useState(false);
  const [msgSincronizacao, setMsgSincronizacao] = useState<string | null>(null);

  function carregar() {
    return fetch("/api/titulos-pagar")
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
      });
  }

  useEffect(() => {
    carregar()
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Reduzido de 10 pra 2 minutos (30/09/2026, pedido do João: "tudo tem que
  // atualizar muito rápido"). Só recarrega a lista (direto do Postgres da
  // app, sem chamar o Senior) -- ainda assim não dá pra ir muito abaixo
  // disso: cada carga baixa o histórico completo de títulos (payload grande),
  // então 2min já é bem mais responsivo sem virar polling agressivo demais.
  // O dado do SENIOR em si (OC nova, título cancelado) só muda de verdade
  // quando o cron de 10min (ou o botão "Atualizar agora") roda -- reduzir só
  // este intervalo não acelera aquele lado.
  useEffect(() => {
    const id = setInterval(() => {
      carregar().catch(() => {});
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Botão "Atualizar agora" -- dispara o webhook do n8n (mesma ação do cron
  // de 10 em 10 minutos) e reconsulta a lista depois de um tempo, já que a
  // sincronização roda em segundo plano no VPS (~2 mil títulos, leva alguns
  // minutos).
  const [salvandoRevisao, setSalvandoRevisao] = useState<string | null>(null);
  // Input de "qual OC" aberto ao escolher CORRIGIDO -- guarda o numero
  // digitado por titulo antes de confirmar, pra nao precisar de outro
  // componente/modal so' pra isso.
  const [ocCorrigidoInput, setOcCorrigidoInput] = useState<Record<string, string>>({});

  function atualizarRevisao(id: string, revisadoStatus: string | null, numOcpCorrigido?: string | null) {
    setSalvandoRevisao(id);
    fetch(`/api/titulos-pagar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisadoStatus, numOcpCorrigido: numOcpCorrigido || null }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao salvar revisão");
        setTitulos((anterior) =>
          anterior.map((t) =>
            t.id === id
              ? {
                  ...t,
                  revisadoStatus: data.revisadoStatus,
                  revisadoPorNome: data.revisadoPorNome,
                  revisadoEm: data.revisadoEm,
                  numOcpCorrigido: data.numOcpCorrigido,
                }
              : t
          )
        );
        if (data.avisoCriadorOc) {
          const a = data.avisoCriadorOc;
          setAvisoEmail({
            ok: a.enviado,
            texto: a.enviado ? `E-mail enviado ao criador da OC ${a.numOcp} (${a.para})` : `E-mail ao criador da OC não enviado: ${a.motivo}`,
          });
        }
        carregar().catch(() => {}); // o vinculo manual muda a coluna OC de verdade -- recarrega pra refletir
      })
      .catch((e) => setErroOC(e.message))
      .finally(() => setSalvandoRevisao(null));
  }

  // Exporta o que está filtrado na tela (auditoria geral, sem seleção) --
  // Excel simples, sem dossiê, sem total (não é uma lista fechada de pagamento).
  function exportarRelatorioFiltrado() {
    const linhas = filtrados.map((t) => ({
      "Título": t.numTit,
      "OC": t.ocRelacionada ? `OC ${t.ocRelacionada.numOcp} (${t.ocRelacionada.situacaoLabel})` : "Sem OC",
      "Motivo (sem OC)": t.ocRelacionada ? "" : t.motivoSemOC || "",
      "Status revisão": t.revisadoStatus ? REVISAO_LABEL[t.revisadoStatus] || t.revisadoStatus : "Não revisado",
      "Revisado por": t.revisadoPorNome || "",
      "Revisado em": t.revisadoEm ? formatDataHora(t.revisadoEm) : "",
      "Tipo": t.tipo,
      "Criação": formatData(t.dataEmissao),
      "Fornecedor": t.fornecedorNome,
      "Cód. forma pgto": t.codFpg ?? "",
      "Forma de pagamento": t.formaPagamento ?? "",
      "Centro de custo": t.ccuNome || "",
      "Vencto programado": formatData(t.vencimentoProgramado),
      "Pago em": t.dataPagamento ? formatData(t.dataPagamento) : "",
      "Valor original": t.valorOriginal,
      "Valor em aberto": t.valorAberto,
      "Situação": t.pago ? "Pago" : "Não pago",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [
      { wch: 14 }, { wch: 22 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
      { wch: 8 }, { wch: 12 }, { wch: 38 }, { wch: 12 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programação de Pagamento");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Programacao_Pagamento_${hoje}.xlsx`);
  }

  const [gerandoPacote, setGerandoPacote] = useState(false);

  // Pacote pra mandar pra fora do sistema (30/09/2026, pedido do João:
  // "quando eu exportar os que selecionei já vem uma pasta com o dossiê
  // deles ... pra ir pro André"): pede pro servidor montar um ZIP com o
  // Excel (+ linha de TOTAL) e o PDF do dossiê de cada título selecionado.
  function exportarPacoteSelecionados() {
    setGerandoPacote(true);
    setErroOC(null);
    fetch("/api/titulos-pagar/exportar-pacote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selecionados] }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao gerar o pacote");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const hoje = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `Pagamento_Selecionados_${hoje}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setErroOC(e.message))
      .finally(() => setGerandoPacote(false));
  }

  function exportarRelatorio() {
    if (selecionados.size > 0) exportarPacoteSelecionados();
    else exportarRelatorioFiltrado();
  }

  function alternarSelecao(id: string) {
    const titulo = titulos.find((t) => t.id === id);
    if (titulo && situacaoEspecial(titulo)) return; // travado -- ver SITUACAO_ESPECIAL_LABEL
    setSelecionados((anterior) => {
      const novo = new Set(anterior);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function selecionarTodosFiltrados() {
    setSelecionados((anterior) => {
      const novo = new Set(anterior);
      for (const t of filtrados) {
        if (!t.pago && t.ocRelacionada && !situacaoEspecial(t)) novo.add(t.id);
      }
      return novo;
    });
  }

  function limparSelecao() {
    setSelecionados(new Set());
  }

  const qtdAprovados = useMemo(
    () => titulos.filter((t) => t.revisadoStatus === "APROVADO" && !t.pago && !situacaoEspecial(t)).length,
    [titulos]
  );

  function selecionarAprovados() {
    setSelecionados(
      new Set(titulos.filter((t) => t.revisadoStatus === "APROVADO" && !t.pago && !situacaoEspecial(t)).map((t) => t.id))
    );
  }

  // Handoff pra tela de Pagamentos Itaú (30/09/2026): antes disso a pessoa
  // tinha que redigitar título/fornecedor/valor na outra tela -- agora so'
  // passa os ids pelo sessionStorage, a tela de destino ja' tem o titulo
  // completo (mesma fonte /api/titulos-pagar) e monta o carrinho sozinha.
  function enviarParaRemessaItau() {
    sessionStorage.setItem("handoffRemessaItau", JSON.stringify([...selecionados]));
    router.push("/pagamentos-itau");
  }

  // ACHADO 30/09/2026: este botao so' disparava a sincronizacao de TITULOS
  // -- o vinculo com OC vem de uma sincronizacao SEPARADA (AprovacaoSenior,
  // rodando sozinha a cada 10min via n8n), que esse botao nunca tocava.
  // Por isso alguem podia clicar "Atualizar agora" varias vezes e a OC
  // continuar desatualizada (so' o titulo atualizava). Agora dispara as
  // DUAS, em paralelo -- clique unico, atualizacao completa de verdade.
  function sincronizarAgora() {
    setSincronizando(true);
    setMsgSincronizacao(null);
    Promise.allSettled([
      fetch("/api/senior/titulos-pagar/sincronizar-agora", { method: "POST" }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "títulos: erro ao disparar");
      }),
      fetch("/api/senior/aprovacoes/sincronizar-agora", { method: "POST" }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "OCs: erro ao disparar");
      }),
    ])
      .then((resultados) => {
        const falhas = resultados.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (falhas.length === resultados.length) {
          throw new Error(falhas.map((f) => f.reason?.message).join(" / "));
        }
        setMsgSincronizacao(
          falhas.length > 0
            ? `Disparado parcialmente (falhou: ${falhas.map((f) => f.reason?.message).join(", ")}) — atualizando em alguns minutos...`
            : "Sincronização de títulos e OCs disparada — atualizando em alguns minutos..."
        );
        setTimeout(() => {
          carregar().then(() => setMsgSincronizacao("Lista atualizada com o retrato mais recente do Senior."));
        }, 90000);
      })
      .catch((e) => setMsgSincronizacao(e.message))
      .finally(() => setSincronizando(false));
  }

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
          (t.formaPagamento ?? "").toLowerCase().includes(termo) ||
          (t.codFpg ?? "").toLowerCase().includes(termo) ||
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
        if (!textoContem(t.codFpg, f.codFpg)) return false;
        if (!textoContem(t.formaPagamento, f.formaPagamento)) return false;
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {sincronizadoEm && (
              <p
                className={`text-[11px] ${
                  (minutosDesde(sincronizadoEm) ?? 0) > 20 ? "font-medium text-amber-700" : "text-gray-400"
                }`}
                title="Atualiza sozinho a cada 10 minutos; use o botão ao lado pra forçar agora."
              >
                Sincronizado do Senior em {formatDataHora(sincronizadoEm)}
                {(minutosDesde(sincronizadoEm) ?? 0) > 20 &&
                  ` · ${Math.floor(minutosDesde(sincronizadoEm) ?? 0)} min atrás`}
              </p>
            )}
            <button
              onClick={sincronizarAgora}
              disabled={sincronizando}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {sincronizando ? "Sincronizando..." : "↻ Atualizar agora"}
            </button>
            {msgSincronizacao && <span className="text-[11px] text-gray-500">{msgSincronizacao}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {qtdAprovados > 0 && selecionados.size === 0 && (
            <button
              onClick={selecionarAprovados}
              title="Seleciona todos os títulos marcados como Aprovado na coluna Revisão"
              className="rounded-lg border border-brand px-2 py-1.5 text-xs font-medium text-brand hover:bg-brand-light"
            >
              Selecionar {qtdAprovados} aprovado(s)
            </button>
          )}
          {selecionados.size > 0 && (
            <>
              <span className="text-xs text-gray-500">
                {selecionados.size} selecionado(s) · {formatMoeda(titulos.filter((t) => selecionados.has(t.id)).reduce((s, t) => s + t.valorAberto, 0))}
              </span>
              <button
                onClick={limparSelecao}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
              >
                Limpar seleção
              </button>
              <button
                onClick={enviarParaRemessaItau}
                title="Leva os títulos selecionados pro carrinho da tela de Pagamentos Itaú, sem precisar redigitar nada"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                → Enviar para remessa Itaú
              </button>
            </>
          )}
          <button
            onClick={exportarRelatorio}
            disabled={(selecionados.size === 0 && filtrados.length === 0) || gerandoPacote}
            title={
              selecionados.size > 0
                ? "Baixa um .zip com o Excel dos selecionados (+ TOTAL) e o dossiê em PDF de cada um"
                : "Exporta pra Excel exatamente os títulos que estão filtrados na tela agora"
            }
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {gerandoPacote ? "Gerando pacote…" : selecionados.size > 0 ? "⬇ Exportar pacote (.zip + dossiês)" : "⬇ Exportar relatório"}
          </button>
          <button
            onClick={() => setMostrarRegras((v) => !v)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {mostrarRegras ? "Ocultar regras" : "Quando um título tem (ou não) OC?"}
          </button>
          <button
            onClick={() => setMostrarProgramadas(true)}
            title="OCs com previsão de pagamento (USU_DATVECT) num período, e o que falta pra cada uma entrar aqui"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            📋 OCs programadas
          </button>
        </div>
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
              <th className="px-2 py-2">
                <button
                  onClick={selecionarTodosFiltrados}
                  title="Seleciona todos os títulos filtrados (não pagos, com OC) pra mandar pra remessa Itaú"
                  className="normal-case tracking-normal text-gray-400 underline decoration-dotted hover:text-brand"
                >
                  sel.
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">OC</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Criação</th>
              <th className="px-3 py-2 font-medium">Lançado no Senior</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Cód. forma pgto</th>
              <th className="px-3 py-2 font-medium">Forma de pagamento</th>
              <th className="px-3 py-2 font-medium">Centro de custo</th>
              <th className="px-3 py-2 font-medium">Vencto programado</th>
              {mostrarColunaPagamento && <th className="px-3 py-2 font-medium">Pago em</th>}
              <th className="px-3 py-2 text-right font-medium">Valor original</th>
              <th className="px-3 py-2 text-right font-medium">Valor em aberto</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 font-medium">Revisão</th>
            </tr>
            <tr className="border-t border-gray-200 bg-white align-top">
              <th className="px-2 py-2" />
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
                  aria-label="Filtrar código da forma de pagamento"
                  type="text"
                  placeholder="cód..."
                  value={filtrosColuna.codFpg}
                  onChange={(e) => atualizarFiltroColuna("codFpg", e.target.value)}
                  className="w-full min-w-[60px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
                />
              </th>
              <th className="px-2 py-2">
                <input
                  aria-label="Filtrar forma de pagamento"
                  type="text"
                  placeholder="forma..."
                  value={filtrosColuna.formaPagamento}
                  onChange={(e) => atualizarFiltroColuna("formaPagamento", e.target.value)}
                  className="w-full min-w-[120px] rounded border border-gray-200 px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none"
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
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtradosMostrados.map((t, i) => (
              <tr key={t.id} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar título ${t.numTit}`}
                    checked={selecionados.has(t.id)}
                    disabled={situacaoEspecial(t)}
                    title={situacaoEspecial(t) ? labelSituacaoEspecial(t.situacao) + " — travado pra não arriscar pagamento em dobro" : undefined}
                    onChange={() => alternarSelecao(t.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </td>
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
                <td className="px-3 py-1.5 tabular-nums text-gray-600">{t.codFpg ?? <span className="text-gray-300">—</span>}</td>
                <td className="max-w-[170px] truncate px-3 py-1.5 text-gray-600" title={t.formaPagamento ?? undefined}>
                  {t.formaPagamento ?? <span className="text-gray-300">—</span>}
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
                  {situacaoEspecial(t) && (
                    <span
                      className="ml-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700"
                      title="Status fora de Aberto/Pago no Senior -- pode já estar comprometido em outro fluxo de pagamento. Não incluir em remessa nova."
                    >
                      {labelSituacaoEspecial(t.situacao)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <select
                    aria-label="Status de revisão"
                    value={t.revisadoStatus ?? ""}
                    disabled={salvandoRevisao === t.id}
                    onChange={(e) => atualizarRevisao(t.id, e.target.value || null)}
                    title={
                      t.revisadoPorNome
                        ? `Revisado por ${t.revisadoPorNome} em ${formatDataHora(t.revisadoEm)}`
                        : "Ainda não revisado"
                    }
                    className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 ${
                      t.revisadoStatus ? REVISAO_COR[t.revisadoStatus] : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <option value="">Não revisado</option>
                    <option value="APROVADO">Aprovado</option>
                    <option value="CORRIGIDO">Corrigido</option>
                    <option value="SEM_OC_CONFIRMADO">Sem OC (confirmado)</option>
                    <option value="AGUARDANDO_COMPRAS">Aguardando compras</option>
                    <option value="ENVIADO_AGUARDANDO_BAIXA">Enviado (aguarda baixa Senior)</option>
                  </select>
                  {t.revisadoStatus === "CORRIGIDO" && (
                    <div className="mt-1 flex items-center gap-1">
                      {t.numOcpCorrigido ? (
                        <span
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                          title="Vinculada manualmente, sem precisar de NF/referência"
                        >
                          → OC {t.numOcpCorrigido}
                        </span>
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="nº da OC"
                            value={ocCorrigidoInput[t.id] ?? ""}
                            onChange={(e) => setOcCorrigidoInput((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && ocCorrigidoInput[t.id]) atualizarRevisao(t.id, "CORRIGIDO", ocCorrigidoInput[t.id]);
                            }}
                            disabled={salvandoRevisao === t.id}
                            className="w-20 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-brand"
                          />
                          <button
                            onClick={() => ocCorrigidoInput[t.id] && atualizarRevisao(t.id, "CORRIGIDO", ocCorrigidoInput[t.id])}
                            disabled={!ocCorrigidoInput[t.id] || salvandoRevisao === t.id}
                            title="Vincula esta OC ao título direto, sem precisar bater NF -- confere fornecedor antes de salvar"
                            className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                          >
                            vincular
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtradosMostrados.length === 0 && (
              <tr>
                <td colSpan={mostrarColunaPagamento ? 17 : 16} className="px-4 py-6 text-center text-gray-400">
                  Nenhum título encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {avisoEmail && (
        <div
          className={`fixed inset-x-0 bottom-16 z-50 mx-auto w-fit rounded-lg px-4 py-2 text-sm shadow-lg ${avisoEmail.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
          onClick={() => setAvisoEmail(null)}
        >
          {avisoEmail.texto} (clique pra fechar)
        </div>
      )}
      {erroOC && (
        <div
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg"
          onClick={() => setErroOC(null)}
        >
          {erroOC} (clique pra fechar)
        </div>
      )}
      {ocAberta && (
        <MapaOC
          aprovacao={ocAberta}
          codToNome={codToNomeOC}
          titulosVinculados={titulosDaOC}
          onClose={() => setOcAberta(null)}
          onAtualizado={() => abrirOC(ocAberta.numOcp)}
        />
      )}
      {mostrarProgramadas && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => setMostrarProgramadas(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">OCs programadas</h2>
                <p className="text-[11px] text-gray-500">
                  Previsão de pagamento da OC no Senior (USU_DATVECT) — separado do vencimento do título.
                </p>
              </div>
              <button onClick={() => setMostrarProgramadas(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
              <label className="text-[11px] text-gray-500">
                De
                <input
                  type="date"
                  value={progDe}
                  onChange={(e) => setProgDe(e.target.value)}
                  className="ml-1.5 rounded border border-gray-200 px-1.5 py-1 text-xs"
                />
              </label>
              <label className="text-[11px] text-gray-500">
                até
                <input
                  type="date"
                  value={progAte}
                  onChange={(e) => setProgAte(e.target.value)}
                  className="ml-1.5 rounded border border-gray-200 px-1.5 py-1 text-xs"
                />
              </label>
              <button
                onClick={carregarProgramadas}
                disabled={carregandoProg}
                className="ml-auto rounded-full border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {carregandoProg ? "Carregando…" : "↻ Atualizar"}
              </button>
            </div>

            {dadosProg?.resumo && (
              <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-2.5 text-[11px]">
                {Object.entries(dadosProg.resumo)
                  .filter(([k]) => k !== "total")
                  .map(([k, v]) =>
                    v > 0 ? (
                      <span key={k} className={`rounded-full px-2 py-0.5 font-medium ${PROG_STATUS[k]?.cor ?? "bg-gray-100 text-gray-600"}`}>
                        {v} {PROG_STATUS[k]?.label ?? k}
                      </span>
                    ) : null
                  )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {erroProg && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erroProg}</p>}
              {!carregandoProg && dadosProg?.ocs.length === 0 && (
                <p className="py-6 text-center text-xs text-gray-400">Nenhuma OC com previsão de pagamento nesse período.</p>
              )}
              <div className="space-y-1.5">
                {dadosProg?.ocs.map((oc) => (
                  <button
                    key={oc.numOcp}
                    onClick={() => abrirOC(oc.numOcp)}
                    className="block w-full rounded-lg border border-gray-100 px-3 py-2 text-left text-xs hover:border-gray-300 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-gray-800">OC {oc.numOcp}</span>
                      <span className="font-mono text-gray-600">{formatMoeda(oc.valor)}</span>
                    </div>
                    <div className="mt-0.5 text-gray-500">{oc.fornecedorNome}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PROG_STATUS[oc.status]?.cor}`}>
                        {PROG_STATUS[oc.status]?.label}
                      </span>
                      {oc.titulo && <span className="font-mono text-[10px] text-gray-400">título {oc.titulo.numTit}</span>}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">{oc.detalhe}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
