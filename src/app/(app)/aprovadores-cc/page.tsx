"use client";

// Aprovadores por CC (23/11/2026): toda a alcada de aprovacao de OC da Senior (tela F068CNA, rotina 12), por centro de custo e nivel.
// So' leitura: para mudar um aprovador, use a Senior. Filtro em todas as colunas, no mesmo padrao da tela Aprovacoes (OC Senior).
import { useEffect, useMemo, useRef, useState } from "react";
import BotaoExcel from "@/components/BotaoExcel";
import type { AbaExcel } from "@/lib/exportarExcel";
import type { LinhaAlcada } from "@/lib/senior/alcadaCc";

const LIMITE_LINHAS = 1000;

type Filtros = {
  empresa: string;
  cc: string;
  nomeCcu: string;
  tipo: string;
  nivel: string;
  codUsu: string;
  nome: string;
  login: string;
  email: string;
  setor: string;
  situacao: string;
  nivelDoUsuario: string;
  usuarioSenior: string;
  folha: string;
  noSistema: string;
  incluidoEm: string;
  incluidoPor: string;
  alteradoEm: string;
  alteradoPor: string;
};

// Padrao: a alcada vigente (vinculos ativos e niveis sem aprovador ativo) da empresa que o sistema usa nas OCs (1 = CONSOMINAS).
const FILTROS_PADRAO: Filtros = {
  empresa: "1", cc: "", nomeCcu: "", tipo: "", nivel: "", codUsu: "", nome: "", login: "", email: "", setor: "", situacao: "VIGENTE",
  nivelDoUsuario: "", usuarioSenior: "", folha: "", noSistema: "", incluidoEm: "", incluidoPor: "", alteradoEm: "", alteradoPor: "",
};

const ROTULO_SITUACAO: Record<LinhaAlcada["situacao"], string> = { ATIVO: "Ativo", INATIVO: "Inativo", VAZIO: "Sem aprovador ativo" };
const ESTILO_SITUACAO: Record<LinhaAlcada["situacao"], string> = {
  ATIVO: "bg-emerald-100 text-emerald-700",
  INATIVO: "bg-gray-100 text-gray-500",
  VAZIO: "bg-amber-100 text-amber-800",
};
const ROTULO_NIVEL_USUARIO: Record<string, string> = { ATIVO: "Ativo", INATIVO: "Inativo", SEM_CADASTRO: "Sem cadastro" };
const ROTULO_USUARIO_SENIOR: Record<string, string> = { ATIVO: "Ativo", INATIVO: "Inativo", BLOQUEADO: "Bloqueado", SEM_CADASTRO: "Sem cadastro na empresa" };
const ROTULO_FOLHA: Record<string, string> = { ATIVO: "Na folha", NAO_ENCONTRADO: "Não encontrado" };
const ROTULO_TIPO: Record<string, string> = { ANALITICO: "Analítico", SINTETICO: "Sintético" };

const CLASSE_FILTRO =
  "w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-normal normal-case tracking-normal focus:border-brand focus:outline-none";

function normalizar(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().trim();
}

function textoContem(valor: string | null | undefined, filtro: string) {
  return !filtro.trim() || normalizar(valor).includes(normalizar(filtro));
}

/** Filtro de data das colunas: a partir do dia escolhido. */
function aPartirDe(iso: string | null, filtro: string) {
  return !filtro || (!!iso && iso.slice(0, 10) >= filtro);
}

function formatDataHora(iso: string | null) {
  if (!iso) return "—";
  const [dia, hora] = iso.split("T");
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}${hora && hora !== "00:00" ? ` ${hora}` : ""}`;
}

function formatLeitura(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Algo nesse vinculo merece atencao de quem cuida da alcada. */
function pontoDeAtencao(l: LinhaAlcada) {
  if (l.situacao === "VAZIO") return true;
  if (l.situacao !== "ATIVO") return false;
  return l.nivelDoUsuario !== "ATIVO" || l.usuarioSenior !== "ATIVO" || l.folha === "NAO_ENCONTRADO" || l.tipoCcu === "SINTETICO" || !!l.loginNoCadastro;
}

const textoNoSistema = (l: LinhaAlcada) => (l.codUsu ? l.pessoaNoSistema ?? "sem vínculo" : "");

function FiltroTexto({ rotulo, valor, onChange, placeholder, largura = "min-w-[90px]" }: { rotulo: string; valor: string; onChange: (v: string) => void; placeholder: string; largura?: string }) {
  return <input aria-label={rotulo} type="text" placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} className={`${CLASSE_FILTRO} ${largura}`} />;
}

function FiltroSelect({ rotulo, valor, onChange, opcoes, largura = "min-w-[100px]" }: { rotulo: string; valor: string; onChange: (v: string) => void; opcoes: { valor: string; rotulo: string }[]; largura?: string }) {
  return (
    <select aria-label={rotulo} value={valor} onChange={(e) => onChange(e.target.value)} className={`${CLASSE_FILTRO} ${largura}`}>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>{o.rotulo}</option>
      ))}
    </select>
  );
}

function FiltroData({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 font-normal normal-case tracking-normal text-gray-400" title={`${rotulo}: a partir do dia escolhido`}>
      <span className="text-[10px]">desde</span>
      <input aria-label={`${rotulo} a partir de`} type="date" value={valor} onChange={(e) => onChange(e.target.value)} className={`${CLASSE_FILTRO} min-w-[120px]`} />
    </label>
  );
}

export default function AprovadoresPorCcPage() {
  const [linhas, setLinhas] = useState<LinhaAlcada[]>([]);
  const [lidoEm, setLidoEm] = useState<string | null>(null);
  const [folhaEm, setFolhaEm] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erroAtualizar, setErroAtualizar] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soAtencao, setSoAtencao] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [mostrarLegenda, setMostrarLegenda] = useState(false);
  // Barra de rolagem horizontal presa ao pe' da tela (pedido do Gabriel, 23/11/2026): a tabela e' larga e comprida, e a barra
  // nativa ficava no fim dela, fora de vista. Esta barra anda junto com a tabela e fica sempre visivel enquanto a tabela aparece.
  const caixaTabelaRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const [larguraTabela, setLarguraTabela] = useState(0);
  useEffect(() => {
    const tabela = caixaTabelaRef.current?.querySelector("table");
    if (!tabela) return;
    const medir = () => setLarguraTabela(tabela.scrollWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(tabela);
    return () => observador.disconnect();
  }, [loading]);
  // posicao que a propria sincronizacao deu a cada lado: o evento de rolagem que ela provoca (eco) e' ignorado, senao o eco
  // atrasado puxaria de volta a barra enquanto a pessoa ainda arrasta
  const posicaoDefinida = useRef(new Map<HTMLDivElement, number>());
  function rolarJunto(origem: HTMLDivElement | null, destino: HTMLDivElement | null) {
    if (!origem || !destino) return;
    const definida = posicaoDefinida.current.get(origem);
    posicaoDefinida.current.delete(origem);
    if (definida !== undefined && Math.abs(definida - origem.scrollLeft) < 1) return;
    if (Math.abs(destino.scrollLeft - origem.scrollLeft) < 1) return;
    posicaoDefinida.current.set(destino, origem.scrollLeft);
    destino.scrollLeft = origem.scrollLeft;
  }

  function atualizarFiltro<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function carregar(forcar = false) {
    return fetch(`/api/senior/alcada-cc${forcar ? "?atualizar=1" : ""}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar a alçada");
        }
        return res.json();
      })
      .then((data) => {
        setLinhas(data.linhas ?? []);
        setLidoEm(data.lidoEm ?? null);
        setFolhaEm(data.folhaEm ?? null);
        setAviso(data.aviso ?? null);
      });
  }

  useEffect(() => {
    carregar()
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function atualizarAgora() {
    setAtualizando(true);
    setErroAtualizar(null);
    carregar(true)
      .catch((e) => setErroAtualizar(e.message))
      .finally(() => setAtualizando(false));
  }

  const empresas = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) m.set(l.codEmp, l.empresa);
    return [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [linhas]);
  const niveis = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of linhas) if (!m.has(l.nivel)) m.set(l.nivel, l.nomeNivel);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [linhas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim();
    const f = filtros;
    return linhas.filter((l) => {
      if (termo) {
        const alvo = `${l.empresa} ${l.codCcu} ${l.nomeCcu ?? ""} ${l.nomeNivel} ${l.codUsu ?? ""} ${l.nome ?? ""} ${l.login ?? ""} ${l.loginNoCadastro ?? ""} ${l.email ?? ""} ${l.setor ?? ""} ${l.pessoaNoSistema ?? ""}`;
        if (!textoContem(alvo, termo)) return false;
      }
      if (soAtencao && !pontoDeAtencao(l)) return false;
      if (f.empresa && l.codEmp !== f.empresa) return false;
      if (!textoContem(l.codCcu, f.cc)) return false;
      if (!textoContem(l.nomeCcu, f.nomeCcu)) return false;
      if (f.tipo && (l.tipoCcu ?? "SEM") !== f.tipo) return false;
      if (f.nivel && String(l.nivel) !== f.nivel) return false;
      if (!textoContem(l.codUsu, f.codUsu)) return false;
      if (!textoContem(l.nome, f.nome)) return false;
      if (!textoContem(`${l.login ?? ""} ${l.loginNoCadastro ?? ""}`, f.login)) return false;
      if (!textoContem(l.email, f.email)) return false;
      if (!textoContem(l.setor, f.setor)) return false;
      if (f.situacao === "VIGENTE" ? l.situacao === "INATIVO" : f.situacao && l.situacao !== f.situacao) return false;
      if (f.nivelDoUsuario && l.nivelDoUsuario !== f.nivelDoUsuario) return false;
      if (f.usuarioSenior && l.usuarioSenior !== f.usuarioSenior) return false;
      if (f.folha && (f.folha === "SEM_DADO" ? !(l.codUsu && l.folha === null) : l.folha !== f.folha)) return false;
      if (!textoContem(textoNoSistema(l), f.noSistema)) return false;
      if (!aPartirDe(l.incluidoEm, f.incluidoEm)) return false;
      if (!textoContem(l.incluidoPor, f.incluidoPor)) return false;
      if (!aPartirDe(l.alteradoEm, f.alteradoEm)) return false;
      if (!textoContem(l.alteradoPor, f.alteradoPor)) return false;
      return true;
    });
  }, [linhas, busca, soAtencao, filtros]);
  const mostradas = filtradas.slice(0, LIMITE_LINHAS);

  const resumo = useMemo(() => {
    const ativos = filtradas.filter((l) => l.situacao === "ATIVO");
    return {
      ativos: ativos.length,
      ccs: new Set(filtradas.map((l) => `${l.codEmp}|${l.codCcu}`)).size,
      vazios: filtradas.filter((l) => l.situacao === "VAZIO").length,
      pessoas: new Set(ativos.map((l) => l.codUsu)).size,
      atencao: filtradas.filter(pontoDeAtencao).length,
    };
  }, [filtradas]);

  const filtrosAlterados = busca.trim() !== "" || soAtencao || (Object.keys(FILTROS_PADRAO) as (keyof Filtros)[]).some((k) => filtros[k] !== FILTROS_PADRAO[k]);
  const algumFiltro = busca.trim() !== "" || soAtencao || Object.values(filtros).some(Boolean);
  const temFolha = linhas.some((l) => l.folha !== null);

  function limparFiltros() {
    setBusca("");
    setSoAtencao(false);
    setFiltros(FILTROS_PADRAO);
  }

  function abasExcel(): AbaExcel[] {
    return [
      {
        nome: "Aprovadores por CC",
        observacao: `Alçada de aprovação de OC (Senior, tela F068CNA, rotina 12) · lida em ${formatLeitura(lidoEm)} · ${algumFiltro ? "com os filtros da tela" : "sem filtros"} · gerado em ${new Date().toLocaleString("pt-BR")}`,
        colunas: [
          { titulo: "Empresa", largura: 16 }, { titulo: "CC", largura: 10 }, { titulo: "Centro de custo", largura: 40 }, { titulo: "Tipo do CC", largura: 12 },
          { titulo: "Nível", tipo: "inteiro" }, { titulo: "Nome do nível", largura: 14 }, { titulo: "Cód. aprovador", largura: 12 }, { titulo: "Aprovador", largura: 32 },
          { titulo: "Login", largura: 20 }, { titulo: "Login no E099USU (se diferente)", largura: 20 }, { titulo: "E-mail", largura: 32 }, { titulo: "Descrição no Senior", largura: 28 }, { titulo: "Vínculo", largura: 20 },
          { titulo: "Nível do usuário", largura: 16 }, { titulo: "Usuário Senior", largura: 20 }, { titulo: "Folha", largura: 16 }, { titulo: "No sistema Gestão", largura: 28 },
          { titulo: "Incluído em", largura: 18 }, { titulo: "Incluído por", largura: 18 }, { titulo: "Alterado em", largura: 18 }, { titulo: "Alterado por", largura: 18 },
        ],
        linhas: filtradas.map((l) => [
          l.empresa, l.codCcu, l.nomeCcu ?? "", l.tipoCcu ? ROTULO_TIPO[l.tipoCcu] : "", l.nivel, l.nomeNivel, l.codUsu ?? "", l.nome ?? "", l.login ?? "", l.loginNoCadastro ?? "", l.email ?? "",
          l.setor ?? "", ROTULO_SITUACAO[l.situacao], l.nivelDoUsuario ? ROTULO_NIVEL_USUARIO[l.nivelDoUsuario] : "", l.usuarioSenior ? ROTULO_USUARIO_SENIOR[l.usuarioSenior] : "",
          l.folha ? ROTULO_FOLHA[l.folha] : "", textoNoSistema(l), l.incluidoEm ? formatDataHora(l.incluidoEm) : "", l.incluidoPor ?? "",
          l.alteradoEm ? formatDataHora(l.alteradoEm) : "", l.alteradoPor ?? "",
        ]),
      },
    ];
  }

  if (loading)
    return (
      <div className="p-6 text-sm text-gray-500">
        Lendo a alçada na Senior... <span className="text-gray-400">(a primeira leitura pode levar até 1 minuto)</span>
      </div>
    );
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  const opcoesEmpresa = [{ valor: "", rotulo: "todas" }, ...empresas.map(([c, n]) => ({ valor: c, rotulo: `${c} · ${n}` }))];
  const opcoesNivel = [{ valor: "", rotulo: "todos" }, ...niveis.map(([n, nome]) => ({ valor: String(n), rotulo: `${n} · ${nome}` }))];
  const sim = (v: string, rotulos: Record<string, string>, extra: { valor: string; rotulo: string }[] = []) => [
    { valor: "", rotulo: v },
    ...Object.entries(rotulos).map(([valor, rotulo]) => ({ valor, rotulo })),
    ...extra,
  ];

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold">Aprovadores por centro de custo</h1>
          <p className="max-w-3xl text-sm text-gray-500">
            Alçada de aprovação das ordens de compra na Senior (tela F068CNA, rotina 12): quem aprova cada centro de custo em cada
            nível (Coordenador → Gerência → Diretoria). Esta tela só consulta; para trocar um aprovador, use a Senior.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-gray-400" title="A leitura fica guardada por 10 minutos; use o botão ao lado para ler de novo agora.">
              Lido da Senior em {formatLeitura(lidoEm)}
            </p>
            <button
              onClick={atualizarAgora}
              disabled={atualizando}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {atualizando ? "Lendo a Senior..." : "↻ Atualizar agora"}
            </button>
            {(erroAtualizar || aviso) && <span className="text-[11px] font-medium text-amber-700">{erroAtualizar || aviso}</span>}
          </div>
        </div>
        <button
          onClick={() => setMostrarLegenda((v) => !v)}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {mostrarLegenda ? "Ocultar" : "O que significa cada coluna?"}
        </button>
      </div>

      {mostrarLegenda && (
        <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4 text-sm shadow-sm">
          <ul className="space-y-1.5 text-gray-600">
            <li><span className="font-medium text-gray-700">Vínculo:</span> <b>Ativo</b> = a pessoa está na alçada daquele CC e nível. <b>Inativo</b> = já esteve e foi retirada (fica como histórico na Senior). <b>Sem aprovador ativo</b> = o CC tem alçada, mas aquele nível não tem ninguém ativo; a Senior pula o nível e a OC passa sem essa aprovação. <b>Vigente</b> (padrão do filtro) = ativos e níveis sem aprovador.</li>
            <li><span className="font-medium text-gray-700">Nível do usuário:</span> se o nível está ativo para aquela pessoa no cadastro de níveis por usuário da Senior (E068UNA). Vínculo ativo com o nível do usuário inativo merece conferência.</li>
            <li><span className="font-medium text-gray-700">Login:</span> o de acesso à Senior (R910ENT), o mesmo da tela Aprovações (OC Senior). Quando o cadastro de usuários por empresa (E099USU) traz outro login, ele aparece embaixo, em laranja: a conta foi renomeada ou passada para outra pessoa e o cadastro ficou para trás.</li>
            <li><span className="font-medium text-gray-700">Empresa:</span> todas as OCs da Senior são da empresa 1 (CONSOMINAS), e é a alçada dela que vale na aprovação. As demais empresas têm cópias da alçada que não são usadas pelas OCs.</li>
            <li><span className="font-medium text-gray-700">Usuário Senior:</span> situação do login na empresa (E099USU) e bloqueio no cadastro de usuários (R910USU).</li>
            <li><span className="font-medium text-gray-700">Folha:</span> se o login bate com alguém ativo na folha {folhaEm ? `(folha guardada em ${formatLeitura(folhaEm)} pela busca de OCs)` : "(sem folha guardada neste servidor: coluna vazia)"}. A alçada e o login continuam ativos na Senior depois do desligamento.</li>
            <li><span className="font-medium text-gray-700">No sistema Gestão:</span> quem, no sistema, está ligado a esse usuário da Senior e por isso vê as OCs dele em Aprovações (OC Senior): o vínculo manual da tela Usuários &gt; Acesso ou, sem ele, o automático pelo e-mail.</li>
            <li><span className="font-medium text-gray-700">Tipo do CC:</span> analítico recebe lançamento; sintético é agrupador.</li>
            <li><span className="font-medium text-gray-700">Incluído / Alterado:</span> quando e por qual login o vínculo foi criado e alterado pela última vez na Senior. Os filtros de data mostram a partir do dia escolhido.</li>
            <li><span className="font-medium text-gray-700">Só pontos de atenção:</span> níveis sem aprovador ativo e vínculos ativos com nível do usuário inativo, usuário inativo/bloqueado, fora da folha, em CC sintético ou com login diferente no E099USU.</li>
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar CC, aprovador, login, e-mail..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={soAtencao} onChange={(e) => setSoAtencao(e.target.checked)} />
          só pontos de atenção
        </label>
        {filtrosAlterados && (
          <button onClick={limparFiltros} className="text-xs text-gray-400 underline hover:text-gray-600">
            limpar filtros
          </button>
        )}
        <p className="ml-auto text-xs text-gray-400">
          {filtradas.length} de {linhas.length} linha(s)
          {(filtros.empresa || filtros.situacao === "VIGENTE") && (
            <>
              {" · "}
              {filtros.empresa ? `empresa ${empresas.find(([c]) => c === filtros.empresa)?.[1] ?? filtros.empresa}` : "todas as empresas"}
              {filtros.situacao === "VIGENTE" ? ", alçada vigente" : ""}
              {" · "}
              <button onClick={() => setFiltros((p) => ({ ...p, empresa: "", situacao: "" }))} className="underline hover:text-gray-600">
                ver tudo
              </button>
            </>
          )}
        </p>
        <BotaoExcel arquivo="aprovadores-por-cc" gerar={abasExcel} desabilitado={filtradas.length === 0} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Vínculos ativos</p>
          <p className="text-2xl font-semibold">{resumo.ativos}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Centros de custo</p>
          <p className="text-2xl font-semibold">{resumo.ccs}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Aprovadores (pessoas)</p>
          <p className="text-2xl font-semibold">{resumo.pessoas}</p>
        </div>
        <button
          onClick={() => atualizarFiltro("situacao", filtros.situacao === "VAZIO" ? "VIGENTE" : "VAZIO")}
          className={`rounded-xl border p-4 text-left shadow-sm transition ${filtros.situacao === "VAZIO" ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-white hover:bg-amber-50/50"}`}
          title="Clique para ver só os níveis sem aprovador ativo"
        >
          <p className="text-xs text-gray-500">Níveis sem aprovador ativo</p>
          <p className={`text-2xl font-semibold ${resumo.vazios ? "text-amber-700" : ""}`}>{resumo.vazios}</p>
        </button>
        <button
          onClick={() => setSoAtencao((v) => !v)}
          className={`rounded-xl border p-4 text-left shadow-sm transition ${soAtencao ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-white hover:bg-amber-50/50"}`}
          title="Clique para ver só os pontos de atenção"
        >
          <p className="text-xs text-gray-500">Pontos de atenção</p>
          <p className={`text-2xl font-semibold ${resumo.atencao ? "text-amber-700" : ""}`}>{resumo.atencao}</p>
        </button>
      </div>

      {filtradas.length > LIMITE_LINHAS && (
        <p className="mb-2 text-xs text-gray-400">
          mostrando {LIMITE_LINHAS} de {filtradas.length} — use os filtros para achar um CC ou aprovador (o Excel leva todas)
        </p>
      )}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div
          ref={caixaTabelaRef}
          onScroll={() => rolarJunto(caixaTabelaRef.current, barraRef.current)}
          className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
        <table className="w-full min-w-[2200px] border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-3">
              <th>Empresa</th>
              <th>CC</th>
              <th>Centro de custo</th>
              <th>Tipo</th>
              <th>Nível</th>
              <th>Cód.</th>
              <th>Aprovador</th>
              <th>Login</th>
              <th>E-mail</th>
              <th>Descrição no Senior</th>
              <th>Vínculo</th>
              <th>Nível do usuário</th>
              <th>Usuário Senior</th>
              <th>Folha</th>
              <th>No sistema Gestão</th>
              <th>Incluído em</th>
              <th>Incluído por</th>
              <th>Alterado em</th>
              <th>Alterado por</th>
            </tr>
            <tr className="border-t border-gray-200 bg-white align-top [&>th]:px-2 [&>th]:py-2">
              <th><FiltroSelect rotulo="Filtrar empresa" valor={filtros.empresa} onChange={(v) => atualizarFiltro("empresa", v)} opcoes={opcoesEmpresa} largura="min-w-[130px]" /></th>
              <th><FiltroTexto rotulo="Filtrar código do CC" valor={filtros.cc} onChange={(v) => atualizarFiltro("cc", v)} placeholder="código..." largura="min-w-[70px]" /></th>
              <th><FiltroTexto rotulo="Filtrar nome do centro de custo" valor={filtros.nomeCcu} onChange={(v) => atualizarFiltro("nomeCcu", v)} placeholder="centro de custo..." largura="min-w-[180px]" /></th>
              <th><FiltroSelect rotulo="Filtrar tipo do CC" valor={filtros.tipo} onChange={(v) => atualizarFiltro("tipo", v)} opcoes={sim("todos", ROTULO_TIPO, [{ valor: "SEM", rotulo: "sem cadastro" }])} largura="min-w-[95px]" /></th>
              <th><FiltroSelect rotulo="Filtrar nível" valor={filtros.nivel} onChange={(v) => atualizarFiltro("nivel", v)} opcoes={opcoesNivel} largura="min-w-[115px]" /></th>
              <th><FiltroTexto rotulo="Filtrar código do aprovador" valor={filtros.codUsu} onChange={(v) => atualizarFiltro("codUsu", v)} placeholder="cód..." largura="min-w-[55px]" /></th>
              <th><FiltroTexto rotulo="Filtrar aprovador" valor={filtros.nome} onChange={(v) => atualizarFiltro("nome", v)} placeholder="aprovador..." largura="min-w-[160px]" /></th>
              <th><FiltroTexto rotulo="Filtrar login" valor={filtros.login} onChange={(v) => atualizarFiltro("login", v)} placeholder="login..." largura="min-w-[110px]" /></th>
              <th><FiltroTexto rotulo="Filtrar e-mail" valor={filtros.email} onChange={(v) => atualizarFiltro("email", v)} placeholder="e-mail..." largura="min-w-[150px]" /></th>
              <th><FiltroTexto rotulo="Filtrar descrição no Senior" valor={filtros.setor} onChange={(v) => atualizarFiltro("setor", v)} placeholder="descrição..." largura="min-w-[130px]" /></th>
              <th>
                <FiltroSelect
                  rotulo="Filtrar vínculo"
                  valor={filtros.situacao}
                  onChange={(v) => atualizarFiltro("situacao", v)}
                  opcoes={[
                    { valor: "VIGENTE", rotulo: "vigente (ativos e sem aprovador)" },
                    { valor: "ATIVO", rotulo: "Ativo" },
                    { valor: "VAZIO", rotulo: "Sem aprovador ativo" },
                    { valor: "INATIVO", rotulo: "Inativo" },
                    { valor: "", rotulo: "todos" },
                  ]}
                  largura="min-w-[130px]"
                />
              </th>
              <th><FiltroSelect rotulo="Filtrar nível do usuário" valor={filtros.nivelDoUsuario} onChange={(v) => atualizarFiltro("nivelDoUsuario", v)} opcoes={sim("todos", ROTULO_NIVEL_USUARIO)} /></th>
              <th><FiltroSelect rotulo="Filtrar usuário Senior" valor={filtros.usuarioSenior} onChange={(v) => atualizarFiltro("usuarioSenior", v)} opcoes={sim("todos", ROTULO_USUARIO_SENIOR)} largura="min-w-[110px]" /></th>
              <th><FiltroSelect rotulo="Filtrar folha" valor={filtros.folha} onChange={(v) => atualizarFiltro("folha", v)} opcoes={sim("todos", ROTULO_FOLHA, [{ valor: "SEM_DADO", rotulo: "sem dado" }])} /></th>
              <th><FiltroTexto rotulo="Filtrar pessoa no sistema" valor={filtros.noSistema} onChange={(v) => atualizarFiltro("noSistema", v)} placeholder="pessoa ou 'sem vínculo'..." largura="min-w-[150px]" /></th>
              <th><FiltroData rotulo="Incluído em" valor={filtros.incluidoEm} onChange={(v) => atualizarFiltro("incluidoEm", v)} /></th>
              <th><FiltroTexto rotulo="Filtrar quem incluiu" valor={filtros.incluidoPor} onChange={(v) => atualizarFiltro("incluidoPor", v)} placeholder="login..." largura="min-w-[100px]" /></th>
              <th><FiltroData rotulo="Alterado em" valor={filtros.alteradoEm} onChange={(v) => atualizarFiltro("alteradoEm", v)} /></th>
              <th><FiltroTexto rotulo="Filtrar quem alterou" valor={filtros.alteradoPor} onChange={(v) => atualizarFiltro("alteradoPor", v)} placeholder="login..." largura="min-w-[100px]" /></th>
            </tr>
          </thead>
          <tbody>
            {mostradas.map((l) => {
              const vazio = l.situacao === "VAZIO";
              const inativo = l.situacao === "INATIVO";
              return (
                <tr key={l.chave} className={`border-t border-gray-100 align-middle text-[13px] [&>td]:px-3 [&>td]:py-2 ${vazio ? "bg-amber-50/60" : inativo ? "text-gray-400" : ""}`}>
                  <td className="whitespace-nowrap text-xs text-gray-500">{l.empresa}</td>
                  <td className="whitespace-nowrap font-medium">{l.codCcu}</td>
                  <td className="max-w-[260px] truncate" title={l.nomeCcu ?? ""}>{l.nomeCcu ?? <span className="text-gray-400">não cadastrado</span>}</td>
                  <td className={`whitespace-nowrap text-xs ${l.tipoCcu === "SINTETICO" && l.situacao === "ATIVO" ? "font-medium text-amber-700" : "text-gray-500"}`}>{l.tipoCcu ? ROTULO_TIPO[l.tipoCcu] : "—"}</td>
                  <td className="whitespace-nowrap">{l.nivel} · {l.nomeNivel}</td>
                  <td className="whitespace-nowrap tabular-nums text-gray-500">{l.codUsu ?? "—"}</td>
                  <td className="max-w-[220px] truncate font-medium" title={l.nome ?? ""}>{vazio ? <span className="font-normal italic text-amber-700">ninguém ativo neste nível</span> : l.nome}</td>
                  <td className="whitespace-nowrap text-gray-600">
                    {l.login ?? "—"}
                    {l.loginNoCadastro && (
                      <span className="block text-[11px] font-medium text-amber-700" title="Login antigo no cadastro de usuários por empresa da Senior (E099USU). O login de acesso é o de cima; o e-mail e o vínculo com o sistema vêm desse cadastro.">
                        E099USU: {l.loginNoCadastro}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate text-gray-600" title={l.email ?? ""}>{l.email ?? "—"}</td>
                  <td className="max-w-[200px] truncate text-xs text-gray-500" title={l.setor ?? ""}>{l.setor ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_SITUACAO[l.situacao]}`}>{ROTULO_SITUACAO[l.situacao]}</span>
                  </td>
                  <td className={`whitespace-nowrap text-xs ${l.situacao === "ATIVO" && l.nivelDoUsuario !== "ATIVO" ? "font-medium text-amber-700" : ""}`}>
                    {l.nivelDoUsuario ? ROTULO_NIVEL_USUARIO[l.nivelDoUsuario] : "—"}
                  </td>
                  <td className={`whitespace-nowrap text-xs ${l.situacao === "ATIVO" && l.usuarioSenior && l.usuarioSenior !== "ATIVO" ? "font-medium text-amber-700" : ""}`}>
                    {l.usuarioSenior ? ROTULO_USUARIO_SENIOR[l.usuarioSenior] : "—"}
                  </td>
                  <td className={`whitespace-nowrap text-xs ${l.situacao === "ATIVO" && l.folha === "NAO_ENCONTRADO" ? "font-medium text-amber-700" : ""}`}>
                    {l.folha ? ROTULO_FOLHA[l.folha] : l.codUsu && !temFolha ? <span className="text-gray-300">sem dado</span> : "—"}
                  </td>
                  <td className="max-w-[200px] truncate text-xs" title={textoNoSistema(l)}>
                    {l.codUsu ? l.pessoaNoSistema ?? <span className="text-gray-400">sem vínculo</span> : "—"}
                  </td>
                  <td className="whitespace-nowrap text-xs text-gray-500">{formatDataHora(l.incluidoEm)}</td>
                  <td className="whitespace-nowrap text-xs text-gray-500">{l.incluidoPor ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs text-gray-500">{formatDataHora(l.alteradoEm)}</td>
                  <td className="whitespace-nowrap text-xs text-gray-500">{l.alteradoPor ?? "—"}</td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={19} className="px-4 py-6 text-center text-gray-400">
                  {linhas.length ? "Nenhum vínculo bate com esse filtro." : "A Senior não trouxe nenhum vínculo de alçada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <div
          ref={barraRef}
          onScroll={() => rolarJunto(barraRef.current, caixaTabelaRef.current)}
          aria-hidden="true"
          title="Role para os lados para ver todas as colunas"
          // o <main> do layout tem p-4/sm:p-6/lg:p-8: o deslocamento negativo igual cola a barra no pe' da area visivel
          className="sticky -bottom-4 z-10 overflow-x-auto sm:-bottom-6 lg:-bottom-8 overflow-y-hidden rounded-b-xl border-t border-gray-200 bg-white/95 backdrop-blur [&::-webkit-scrollbar-thumb:hover]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-gray-50 [&::-webkit-scrollbar]:h-3"
        >
          <div style={{ width: larguraTabela, height: 1 }} />
        </div>
      </div>
    </div>
  );
}
