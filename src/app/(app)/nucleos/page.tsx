"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import BotaoExcel from "@/components/BotaoExcel";
import EscolhaDePessoas from "@/components/demandas/Pessoas";
import type { PessoaOpcao } from "@/lib/agruparPessoas";
import { filtrarNucleos, ROTULO_TIPO, type TipoNucleo } from "@/lib/nucleosEdicao";
import type { AbaExcel } from "@/lib/exportarExcel";

type Person = { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo?: string | null; nivelHierarquico?: string | null };

type Nucleo = {
  id: string;
  name: string;
  description: string | null;
  tipo: string;
  membros: Person[];
  diretores: Person[];
  gerentes: Person[];
  coordenadores: Person[];
  projetos: { id: string; name: string; status: string }[];
  gero: boolean; // a pessoa e' diretora, gerente ou coordenadora deste nucleo (ou admin): associa projetos e controla as demandas
};

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  SUPERVISOR: "Supervisor",
  COLABORADOR: "Colaborador",
};

const MEMBROS_VISIVEIS = 6;

function Fichas({ titulo, pessoas, cor }: { titulo: string; pessoas: Person[]; cor: string }) {
  if (pessoas.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-500">{titulo}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {pessoas.map((g) => (
          <span key={g.id} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cor}`}>
            <Avatar name={g.name} color={g.avatarColor} photoUrl={g.avatarUrl} size={14} />
            {g.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function NucleosPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  // so' o administrador (Joao, Gabriel e Renata) cria, edita e exclui nucleos; os demais so' consultam
  const isAdmin = role === "ADMIN";
  const canManage = isAdmin;

  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [pessoasApi, setPessoasApi] = useState<PessoaOpcao[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoNucleo | "todos">("todos");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // criar
  const [criando, setCriando] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tipoNovo, setTipoNovo] = useState<TipoNucleo>("SETOR");
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState("");

  // editar (janela)
  const [editando, setEditando] = useState<Nucleo | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTipo, setEditTipo] = useState<TipoNucleo>("SETOR");
  const [editDiretores, setEditDiretores] = useState<string[]>([]);
  const [editGerentes, setEditGerentes] = useState<string[]>([]);
  const [editCoordenadores, setEditCoordenadores] = useState<string[]>([]);
  const [editMembros, setEditMembros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");

  const [meusProjetos, setMeusProjetos] = useState<{ id: string; name: string }[]>([]);
  const [assocChoice, setAssocChoice] = useState<Record<string, string>>({});
  const [erroAssoc, setErroAssoc] = useState("");
  const [msgEquipe, setMsgEquipe] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/nucleos");
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setNucleos(d);
    }
    setCarregado(true);
  }

  async function loadPessoas() {
    const res = await fetch("/api/pessoas");
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setPessoasApi(d);
    }
  }

  async function loadProjetos() {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setMeusProjetos(d.map((p: any) => ({ id: p.id, name: p.name })));
    }
  }

  useEffect(() => {
    load();
    loadPessoas();
    loadProjetos();
  }, []);

  // Esc fecha a janela de edicao
  useEffect(() => {
    if (!editando) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setEditando(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editando]);

  const visiveis = useMemo(() => filtrarNucleos(nucleos, { tipo: tipoFiltro, busca }), [nucleos, tipoFiltro, busca]);
  const contagem = useMemo(() => ({
    todos: nucleos.length,
    SETOR: nucleos.filter((n) => (n.tipo || "SETOR") === "SETOR").length,
    CONTRATO: nucleos.filter((n) => n.tipo === "CONTRATO").length,
  }), [nucleos]);

  // quem aparece nas listas da edicao: todas as pessoas + quem ja esta no nucleo (mesmo que desligado, para nao sumir da ficha)
  const opcoesDaEdicao = useMemo(() => {
    const mapa = new Map<string, PessoaOpcao>(pessoasApi.map((p) => [p.id, p]));
    if (editando) {
      for (const p of [...editando.diretores, ...editando.gerentes, ...editando.coordenadores, ...editando.membros]) {
        if (!mapa.has(p.id)) mapa.set(p.id, { id: p.id, name: p.name, cargo: p.cargo ?? null, nucleo: null });
      }
    }
    return Array.from(mapa.values());
  }, [pessoasApi, editando]);
  // colaboradores: mostra onde a pessoa esta hoje (escolher alguem de outro nucleo o move para este)
  const opcoesColaboradores = useMemo(
    () => opcoesDaEdicao.map((p) => (p.nucleo && editando && p.nucleo !== editando.name ? { ...p, cargo: [p.cargo, `hoje em ${p.nucleo}`].filter(Boolean).join(" · ") } : p)),
    [opcoesDaEdicao, editando],
  );

  async function associar(nucleoId: string, projectId: string, soltar: boolean) {
    setErroAssoc("");
    const res = await fetch(`/api/nucleos/${nucleoId}/projetos`, {
      method: soltar ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErroAssoc(data?.error ?? "Não foi possível atualizar o projeto do núcleo.");
      return;
    }
    setAssocChoice((x) => ({ ...x, [nucleoId]: "" }));
    load();
  }

  // cria uma equipe com as pessoas do nucleo (coordenadores, gerentes e diretores entram como gestores)
  async function criarEquipe(n: Nucleo) {
    const nome = window.prompt("Nome da equipe", `Equipe ${n.name}`);
    if (nome === null) return;
    const res = await fetch(`/api/nucleos/${n.id}/equipe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim() || undefined }) });
    const j = await res.json().catch(() => ({}));
    setMsgEquipe((x) => ({ ...x, [n.id]: res.ok ? `Equipe “${j.name}” criada com ${j.pessoas} pessoa(s). Use-a em Projetos → Novo projeto.` : typeof j.error === "string" ? j.error : "Não foi possível criar a equipe." }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoNovo(true);
    setErroNovo("");
    const res = await fetch("/api/nucleos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description || undefined, tipo: tipoNovo }),
    });
    setSalvandoNovo(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setErroNovo(typeof j?.error === "string" ? j.error : "Não foi possível criar o núcleo.");
      return;
    }
    setName("");
    setDescription("");
    setCriando(false);
    load();
  }

  function abrirEdicao(n: Nucleo) {
    setEditando(n);
    setEditName(n.name);
    setEditDescription(n.description ?? "");
    setEditTipo(n.tipo === "CONTRATO" ? "CONTRATO" : "SETOR");
    setEditDiretores(n.diretores.map((p) => p.id));
    setEditGerentes(n.gerentes.map((p) => p.id));
    setEditCoordenadores(n.coordenadores.map((p) => p.id));
    setEditMembros(n.membros.map((p) => p.id));
    setErroEdicao("");
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvando(true);
    setErroEdicao("");
    const res = await fetch(`/api/nucleos/${editando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        description: editDescription.trim() || null,
        tipo: editTipo,
        diretorIds: editDiretores,
        gerenteIds: editGerentes,
        coordenadorIds: editCoordenadores,
        ...(isAdmin ? { membroIds: editMembros } : {}),
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setErroEdicao(typeof j?.error === "string" ? j.error : "Não foi possível salvar. Confira o nome (mínimo 2 letras) e tente de novo.");
      return;
    }
    setEditando(null);
    load();
    loadPessoas();
  }

  async function handleDelete(n: Nucleo) {
    if (!confirm(`Excluir o núcleo "${n.name}"? Só funciona se não tiver ninguém nele.`)) return;
    const res = await fetch(`/api/nucleos/${n.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível excluir.");
      return;
    }
    load();
  }

  function abasExcel(): AbaExcel[] {
    const papeis = (n: Nucleo): [string, Person[]][] => [["Diretor", n.diretores], ["Gerente", n.gerentes], ["Coordenador", n.coordenadores], ["Colaborador", n.membros]];
    return [
      {
        nome: "Núcleos",
        colunas: [
          { titulo: "Núcleo", largura: 40 }, { titulo: "Tipo", largura: 10 }, { titulo: "Descrição", largura: 40 }, { titulo: "Diretores", largura: 30 }, { titulo: "Gerentes", largura: 30 },
          { titulo: "Coordenadores", largura: 30 }, { titulo: "Colaboradores", tipo: "inteiro" }, { titulo: "Projetos", tipo: "inteiro" },
        ],
        linhas: visiveis.map((n) => [
          n.name, ROTULO_TIPO[(n.tipo === "CONTRATO" ? "CONTRATO" : "SETOR") as TipoNucleo], n.description ?? "", n.diretores.map((p) => p.name).join(", "), n.gerentes.map((p) => p.name).join(", "),
          n.coordenadores.map((p) => p.name).join(", "), n.membros.length, n.projetos.length,
        ]),
      },
      {
        nome: "Pessoas por núcleo",
        colunas: [{ titulo: "Núcleo", largura: 40 }, { titulo: "Tipo", largura: 10 }, { titulo: "Papel", largura: 14 }, { titulo: "Pessoa", largura: 36 }, { titulo: "Cargo", largura: 34 }],
        linhas: visiveis.flatMap((n) => papeis(n).flatMap(([papel, gente]) => gente.map((p) => [n.name, ROTULO_TIPO[(n.tipo === "CONTRATO" ? "CONTRATO" : "SETOR") as TipoNucleo], papel, p.name, p.cargo ?? (p.nivelHierarquico ? nivelLabel[p.nivelHierarquico] : "")]))),
      },
    ];
  }

  const chip = (ativo: boolean) => `rounded-full border px-3 py-1 text-[13px] font-medium transition ${ativo ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`;
  const rotuloCampo = "mb-1 block text-xs font-semibold text-gray-500";

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Núcleos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoExcel arquivo="nucleos" gerar={abasExcel} desabilitado={visiveis.length === 0} />
          {canManage && (
            <button onClick={() => setCriando((v) => !v)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              {criando ? "Fechar" : "+ Novo núcleo"}
            </button>
          )}
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-gray-500">
        Os núcleos são os <b>setores</b> da empresa e os grupos de pessoas de cada <b>contrato</b>. Cada núcleo tem diretores, gerentes e coordenadores (que enxergam e gerem os
        projetos dele) e os colaboradores. Cada pessoa é colaboradora de um núcleo; diretores, gerentes e coordenadores podem estar em mais de um.
      </p>

      {canManage && criando && (
        <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <label className="min-w-[14rem] flex-1">
            <span className={rotuloCampo}>Nome do núcleo</span>
            <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="min-w-[10rem]">
            <span className={rotuloCampo}>Tipo</span>
            <select value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as TipoNucleo)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="SETOR">Setor</option>
              <option value="CONTRATO">Contrato</option>
            </select>
          </label>
          <label className="min-w-[14rem] flex-1">
            <span className={rotuloCampo}>Descrição (opcional)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <button disabled={salvandoNovo} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
            {salvandoNovo ? "Criando…" : "Criar núcleo"}
          </button>
          {erroNovo && <p className="basis-full text-xs text-red-600">{erroNovo}</p>}
        </form>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button className={chip(tipoFiltro === "todos")} onClick={() => setTipoFiltro("todos")}>Todos <span className="opacity-70">{contagem.todos}</span></button>
        <button className={chip(tipoFiltro === "SETOR")} onClick={() => setTipoFiltro("SETOR")}>Setores <span className="opacity-70">{contagem.SETOR}</span></button>
        <button className={chip(tipoFiltro === "CONTRATO")} onClick={() => setTipoFiltro("CONTRATO")}>Contratos <span className="opacity-70">{contagem.CONTRATO}</span></button>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar núcleo ou pessoa…"
          className="ml-auto w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          aria-label="Buscar núcleo ou pessoa"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((n) => {
          const aberto = expandidos.has(n.id);
          const membros = aberto ? n.membros : n.membros.slice(0, MEMBROS_VISIVEIS);
          return (
            <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold leading-tight">{n.name}</h2>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${n.tipo === "CONTRATO" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                    {n.tipo === "CONTRATO" ? "Contrato" : "Setor"}
                  </span>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => abrirEdicao(n)} className="text-xs font-medium text-brand-dark hover:underline">Editar</button>
                    <button onClick={() => handleDelete(n)} className="text-xs text-red-400 hover:text-red-700">Excluir</button>
                  </div>
                )}
              </div>
              {n.description && <p className="mt-2 text-sm text-gray-500">{n.description}</p>}

              <Fichas titulo="Diretores" pessoas={n.diretores} cor="bg-violet-50 text-violet-800" />
              <Fichas titulo="Gerentes" pessoas={n.gerentes} cor="bg-brand/10 text-brand-dark" />
              <Fichas titulo="Coordenadores" pessoas={n.coordenadores} cor="bg-indigo-50 text-indigo-800" />
              {n.diretores.length + n.gerentes.length + n.coordenadores.length === 0 && (
                <p className="mt-3 text-xs text-gray-400">Sem diretor, gerente nem coordenador ainda{canManage ? " — use Editar para escolher." : "."}</p>
              )}

              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500">Projetos do núcleo ({n.projetos.length})</p>
                <ul className="mt-1 space-y-1">
                  {n.projetos.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <a href={`/projetos/${p.id}`} className="flex-1 truncate text-brand-dark hover:underline">{p.name}</a>
                      {n.gero && <button onClick={() => associar(n.id, p.id, true)} className="text-xs text-gray-400 hover:text-red-600">Soltar</button>}
                    </li>
                  ))}
                  {n.projetos.length === 0 && <li className="text-xs text-gray-400">Nenhum projeto associado que você possa ver.</li>}
                </ul>
                {n.gero && (
                  <div className="mt-2 flex items-center gap-2">
                    <select value={assocChoice[n.id] ?? ""} onChange={(e) => setAssocChoice((x) => ({ ...x, [n.id]: e.target.value }))} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs">
                      <option value="">Associar projeto ao núcleo…</option>
                      {meusProjetos.filter((p) => !n.projetos.some((q) => q.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button disabled={!assocChoice[n.id]} onClick={() => associar(n.id, assocChoice[n.id], false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40">Associar</button>
                  </div>
                )}
                {n.gero && <a href="/projetos/demandas" className="mt-2 inline-block text-xs font-medium text-brand-dark hover:underline">Demandas do núcleo →</a>}
              </div>
              {erroAssoc && <p className="mt-2 text-xs text-red-600">{erroAssoc}</p>}

              {n.gero && (
                <div className="mt-3">
                  <button onClick={() => criarEquipe(n)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Criar equipe com as pessoas do núcleo</button>
                  {msgEquipe[n.id] && <p className="mt-1 text-xs text-gray-600">{msgEquipe[n.id]}</p>}
                </div>
              )}

              <p className="mt-3 text-xs font-semibold text-gray-500">Colaboradores ({n.membros.length})</p>
              <ul className="mt-2 space-y-2">
                {membros.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-gray-600">
                    <Avatar name={m.name} color={m.avatarColor} photoUrl={m.avatarUrl} size={24} />
                    <span className="flex-1">{m.name}</span>
                    <span className="text-xs text-gray-400">{m.nivelHierarquico ? nivelLabel[m.nivelHierarquico] : m.cargo ?? ""}</span>
                  </li>
                ))}
                {n.membros.length === 0 && <p className="text-xs text-gray-400">Nenhum colaborador neste núcleo ainda{isAdmin ? " — use Editar para incluir." : "."}</p>}
              </ul>
              {n.membros.length > MEMBROS_VISIVEIS && (
                <button
                  onClick={() => setExpandidos((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })}
                  className="mt-2 text-xs font-medium text-brand-dark hover:underline"
                >
                  {aberto ? "Mostrar menos" : `Ver todos os ${n.membros.length}`}
                </button>
              )}
            </div>
          );
        })}
        {carregado && nucleos.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado ainda.</p>}
        {nucleos.length > 0 && visiveis.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo encontrado com esse filtro.</p>}
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditando(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`Editar ${editando.name}`} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Editar núcleo</h2>
                <p className="text-xs text-gray-400">Escolha as pessoas na lista suspensa; elas podem ser de qualquer núcleo. Só administradores editam núcleos.</p>
              </div>
              <button onClick={() => setEditando(null)} aria-label="Fechar" className="rounded p-1 text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="sm:col-span-2">
                <span className={rotuloCampo}>Nome</span>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label>
                <span className={rotuloCampo}>Tipo</span>
                <select value={editTipo} onChange={(e) => setEditTipo(e.target.value as TipoNucleo)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="SETOR">Setor</option>
                  <option value="CONTRATO">Contrato</option>
                </select>
              </label>
              <label className="sm:col-span-3">
                <span className={rotuloCampo}>Descrição</span>
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="mt-5 space-y-5">
              <section>
                <h3 className="mb-1 text-sm font-semibold text-violet-800">Diretores</h3>
                <EscolhaDePessoas pessoas={opcoesDaEdicao} valor={editDiretores} onChange={setEditDiretores} max={50} vazio="Nenhum diretor." />
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold text-brand-dark">Gerentes</h3>
                <EscolhaDePessoas pessoas={opcoesDaEdicao} valor={editGerentes} onChange={setEditGerentes} max={50} vazio="Nenhum gerente." />
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold text-indigo-800">Coordenadores</h3>
                <EscolhaDePessoas pessoas={opcoesDaEdicao} valor={editCoordenadores} onChange={setEditCoordenadores} max={50} vazio="Nenhum coordenador." />
              </section>
              <section>
                <h3 className="mb-1 text-sm font-semibold text-gray-700">Colaboradores <span className="font-normal text-gray-400">({editMembros.length})</span></h3>
                {isAdmin ? (
                  <>
                    <EscolhaDePessoas pessoas={opcoesColaboradores} valor={editMembros} onChange={setEditMembros} max={1000} vazio="Nenhum colaborador." />
                    <p className="mt-1 text-xs text-gray-400">Cada pessoa é colaboradora de um núcleo só: quem você escolher aqui sai do núcleo onde está hoje e passa a este.</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Só um administrador inclui ou tira colaboradores. {editando.membros.length} pessoa(s) hoje.</p>
                )}
              </section>
            </div>

            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Diretores, gerentes e coordenadores enxergam e gerem os projetos do núcleo (associam projetos e controlam as demandas dele). Colaboradores só ganham essa visão se
              tiverem a visão de projetos “do núcleo” liberada em Usuários.
            </p>

            {erroEdicao && <p className="mt-3 text-sm text-red-600">{erroEdicao}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditando(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={salvarEdicao} disabled={salvando || editName.trim().length < 2} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
