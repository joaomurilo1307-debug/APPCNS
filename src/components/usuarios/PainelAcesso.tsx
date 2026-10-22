"use client";

// Painel de acesso de UMA pessoa (so' o ADMIN abre): perfil pronto, telas (sem acesso / so' ver / editar), visao dos projetos, projetos
// liberados, contratos (nos projetos e no financeiro), nucleos e vinculo com o usuario do Senior. Grava tudo de uma vez em
// PUT /api/users/[id]/acesso. Usado na lista de usuarios e logo depois de criar um usuario.
import { useEffect, useMemo, useState } from "react";

type Nivel = "VER" | "EDITAR";
type Area = "PROJETOS" | "FINANCEIRO" | "AMBOS";
type Escopo = "PROPRIOS" | "NUCLEO" | "TODOS";

type Dados = {
  usuario: { id: string; name: string; email: string; role: string; active: boolean; escopoProjetos: Escopo; verTodosCustos: boolean; nucleoId: string | null };
  papeis: string[];
  grupos: { id: string; nome: string; ajuda: string }[];
  modulos: { id: string; label: string; grupo: string; restrito: boolean; descricao: string }[];
  perfis: { id: string; nome: string; descricao: string; papel: string; modulos: string[]; escopoProjetos: Escopo; nivel?: Nivel; verTodosContratos?: boolean }[];
  acessos: { modulo: string; nivel: Nivel }[];
  projetos: { disponiveis: { id: string; name: string; status: string; equipe: string | null }[]; liberados: string[] };
  contratos: { disponiveis: { codccu: string; nome: string }[]; liberados: { codccu: string; area: Area }[]; verTodos: boolean; verTodosPeloPapel: boolean };
  nucleos: { todos: { id: string; name: string }[]; membroDe: string | null; gerente: string[]; coordenador: string[] };
  senior: { vinculos: { codigo: string; nome: string; tambemUsam: string[] }[]; sugestoes: { codigo: string; nome: string }[] };
};

const PAPEL_ROTULO: Record<string, string> = {
  ADMIN: "Administrador", DIRETOR: "Diretor", GESTOR_PROJETO: "Gestor de projeto", APROVADOR: "Aprovador",
  COLABORADOR: "Colaborador", VISUALIZADOR: "Visualizador (só leitura)", CLIENTE: "Cliente (portal)",
};
const ESCOPO_ROTULO: Record<Escopo, { nome: string; ajuda: string }> = {
  PROPRIOS: { nome: "Só os projetos dele", ajuda: "Os que criou ou em que participa (equipe, tarefa, convite)." },
  NUCLEO: { nome: "Os do núcleo", ajuda: "Além dos dele, os projetos ligados aos núcleos que gere e os das pessoas desses núcleos." },
  TODOS: { nome: "Todos os projetos", ajuda: "Enxerga todos os projetos do sistema." },
};
const AREA_ROTULO: Record<Area, string> = { AMBOS: "Projetos e financeiro", PROJETOS: "Só nos projetos", FINANCEIRO: "Só no financeiro" };

const rot = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500";
const campo = "w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm";

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
      {ajuda && <p className="mb-3 mt-0.5 text-xs text-gray-500">{ajuda}</p>}
      {!ajuda && <div className="mb-3" />}
      {children}
    </section>
  );
}

export default function PainelAcesso({ userId, novo, onFechar, onSalvo }: { userId: string; novo?: boolean; onFechar: () => void; onSalvo?: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [papel, setPapel] = useState("COLABORADOR");
  const [niveis, setNiveis] = useState<Record<string, Nivel | null>>({});
  const [escopo, setEscopo] = useState<Escopo>("PROPRIOS");
  const [projetos, setProjetos] = useState<Set<string>>(new Set());
  const [verTodos, setVerTodos] = useState(false);
  const [contratos, setContratos] = useState<Record<string, Area>>({});
  const [membroDe, setMembroDe] = useState<string | null>(null);
  const [nucleosLista, setNucleosLista] = useState<{ id: string; name: string }[]>([]);
  const [novoNucleo, setNovoNucleo] = useState("");
  const [erroNucleo, setErroNucleo] = useState("");
  const [gerente, setGerente] = useState<Set<string>>(new Set());
  const [coordenador, setCoordenador] = useState<Set<string>>(new Set());
  const [senior, setSenior] = useState<{ codigo: string; nome: string; tambemUsam: string[] }[]>([]);
  const [buscaProjeto, setBuscaProjeto] = useState("");
  const [buscaContrato, setBuscaContrato] = useState("");
  const [buscaSenior, setBuscaSenior] = useState("");
  const [achadosSenior, setAchadosSenior] = useState<{ codigo: string; nome: string; usadoPor: string[] }[] | null>(null);
  const [perfilAplicado, setPerfilAplicado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/users/${userId}/acesso`).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!vivo) return;
      if (!r.ok || !j) return setErro(j?.error ?? "Não foi possível carregar o acesso.");
      const d = j as Dados;
      setDados(d);
      setPapel(d.usuario.role);
      setNiveis(Object.fromEntries(d.acessos.map((a) => [a.modulo, a.nivel])));
      setEscopo(d.usuario.escopoProjetos);
      setProjetos(new Set(d.projetos.liberados));
      setVerTodos(d.contratos.verTodos);
      setContratos(Object.fromEntries(d.contratos.liberados.map((c) => [c.codccu, c.area])));
      setMembroDe(d.nucleos.membroDe);
      setNucleosLista(d.nucleos.todos);
      setGerente(new Set(d.nucleos.gerente));
      setCoordenador(new Set(d.nucleos.coordenador));
      setSenior(d.senior.vinculos);
    });
    return () => { vivo = false; };
  }, [userId]);

  // busca no Senior (espera o admin parar de digitar)
  useEffect(() => {
    if (buscaSenior.trim().length < 2) { setAchadosSenior(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/acesso/senior?q=${encodeURIComponent(buscaSenior.trim())}`);
      if (r.ok) setAchadosSenior((await r.json()).resultados);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaSenior]);

  const ehAdmin = papel === "ADMIN";
  const modulosEditaveis = useMemo(() => (dados?.modulos ?? []).filter((m) => m.grupo !== "admin"), [dados]);

  function aplicarPerfil(id: string) {
    const p = dados?.perfis.find((x) => x.id === id);
    if (!p) return;
    setPerfilAplicado(id);
    if (dados && dados.usuario.role !== "ADMIN") setPapel(p.papel);
    setNiveis(Object.fromEntries(p.modulos.map((m) => [m, (p.nivel ?? "EDITAR") as Nivel])));
    setEscopo(p.escopoProjetos);
    if (p.verTodosContratos !== undefined) setVerTodos(p.verTodosContratos);
  }
  // Modulos que aparecem na tela inicial: nem todo mundo ve todos. Ligar traz as telas comuns do modulo; o financeiro restrito nunca vem junto.
  const MODULOS_TOPO = [
    { id: "gestao", nome: "Projetos e Gestão", ajuda: "Projetos, tarefas, sprint, Gantt, calendário, metas, PDI e relatórios.", grupos: ["gestao"] },
    { id: "financeiro", nome: "Financeiro e Contratos", ajuda: "Contratos, custos, medição, previsão, Aprovações de OC e, só para o time financeiro, os pagamentos.", grupos: ["financeiro", "contratos"] },
  ];
  const idsDoModulo = (grupos: string[]) => modulosEditaveis.filter((m) => grupos.includes(m.grupo));
  const moduloLigado = (grupos: string[]) => idsDoModulo(grupos).some((m) => niveis[m.id]);
  function alternarModulo(grupos: string[], ligar: boolean) {
    setPerfilAplicado(null);
    setNiveis((x) => {
      const n = { ...x };
      for (const m of idsDoModulo(grupos)) {
        if (!ligar) n[m.id] = null;
        else if (!m.restrito && !n[m.id]) n[m.id] = papel === "VISUALIZADOR" ? "VER" : "EDITAR";
      }
      return n;
    });
  }
  async function criarNucleo() {
    const nome = novoNucleo.trim();
    if (nome.length < 2) return setErroNucleo("Digite o nome do núcleo (mínimo 2 letras).");
    setErroNucleo("");
    const r = await fetch("/api/nucleos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.id) return setErroNucleo(typeof j?.error === "string" ? j.error : "Não foi possível criar o núcleo.");
    setNucleosLista((l) => (l.some((n) => n.id === j.id) ? l : [...l, { id: j.id, name: j.name }].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))));
    setMembroDe(j.id);
    setNovoNucleo("");
  }
  const mudarNivel = (id: string, n: Nivel | null) => { setPerfilAplicado(null); setNiveis((x) => ({ ...x, [id]: n })); };
  const alternar = (conj: Set<string>, id: string) => { const n = new Set(conj); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const projetosFiltrados = useMemo(() => {
    const t = buscaProjeto.trim().toLowerCase();
    return (dados?.projetos.disponiveis ?? []).filter((p) => !t || `${p.name} ${p.equipe ?? ""}`.toLowerCase().includes(t)).slice(0, 200);
  }, [dados, buscaProjeto]);
  const contratosFiltrados = useMemo(() => {
    const t = buscaContrato.trim().toLowerCase();
    return (dados?.contratos.disponiveis ?? []).filter((c) => !t || `${c.codccu} ${c.nome}`.toLowerCase().includes(t));
  }, [dados, buscaContrato]);

  async function salvar() {
    if (!dados) return;
    setSalvando(true); setErro("");
    const acessos = Object.entries(niveis).filter(([, n]) => n).map(([modulo, nivel]) => ({ modulo, nivel }));
    const r = await fetch(`/api/users/${userId}/acesso`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: papel !== dados.usuario.role ? papel : undefined,
        acessos, escopoProjetos: escopo, projetos: Array.from(projetos),
        contratos: { verTodos, itens: Object.entries(contratos).map(([codccu, area]) => ({ codccu, area })) },
        nucleos: { membroDe, gerente: Array.from(gerente), coordenador: Array.from(coordenador) },
        senior: senior.map((s) => s.codigo),
      }),
    });
    setSalvando(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErro(typeof j.error === "string" ? j.error : "Não foi possível salvar. Confira os campos.");
    onSalvo?.();
    onFechar();
  }

  const resumo = dados
    ? `${Object.values(niveis).filter(Boolean).length} telas · ${projetos.size} projetos liberados · ${verTodos ? "todos os contratos" : `${Object.keys(contratos).length} contratos`} · ${senior.length} usuário(s) do Senior`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Acesso do usuário">
      <div className="my-6 w-full max-w-5xl rounded-2xl bg-gray-50 shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-t-2xl border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{novo ? "Usuário criado: defina o acesso" : "Acesso do usuário"}</p>
            <h2 className="text-xl font-semibold text-gray-900">{dados?.usuario.name ?? "Carregando…"}</h2>
            {dados && <p className="text-sm text-gray-500">{dados.usuario.email}</p>}
          </div>
          <button onClick={onFechar} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{novo ? "Definir depois" : "Fechar"}</button>
        </header>

        {!dados && !erro && <p className="p-6 text-sm text-gray-500">Carregando…</p>}
        {!dados && erro && <p className="p-6 text-sm text-red-600">{erro}</p>}

        {dados && (
          <div className="grid gap-4 p-6">
            <Secao titulo="Papel e perfil pronto" ajuda="O perfil pronto preenche tudo abaixo de uma vez; depois é só ajustar o que for diferente.">
              <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
                <div>
                  <label className={rot}>Papel no sistema</label>
                  <select className={campo} value={papel} onChange={(e) => { setPapel(e.target.value); setPerfilAplicado(null); }} disabled={dados.usuario.role === "ADMIN" && false}>
                    {dados.papeis.map((p) => <option key={p} value={p}>{PAPEL_ROTULO[p] ?? p}</option>)}
                  </select>
                  {ehAdmin && <p className="mt-1 text-xs text-amber-700">Administrador acessa tudo; as telas abaixo não se aplicam.</p>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {dados.perfis.map((p) => (
                    <button key={p.id} type="button" onClick={() => aplicarPerfil(p.id)}
                      className={`rounded-lg border p-3 text-left transition ${perfilAplicado === p.id ? "border-brand bg-brand/10" : "border-gray-200 bg-white hover:border-brand/50"}`}>
                      <span className="block text-sm font-semibold text-gray-800">{p.nome}</span>
                      <span className="block text-xs text-gray-500">{p.descricao}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Secao>

            <Secao titulo="Módulos" ajuda="Nem todo mundo vê todos os módulos. Ligue só o que a pessoa vai usar; é isso que aparece como cartão na tela inicial dela.">
              <div className={`grid gap-3 sm:grid-cols-2 ${ehAdmin ? "pointer-events-none opacity-50" : ""}`}>
                {MODULOS_TOPO.map((m) => {
                  const ligado = moduloLigado(m.grupos);
                  const total = idsDoModulo(m.grupos).length;
                  const ativas = idsDoModulo(m.grupos).filter((x) => niveis[x.id]).length;
                  return (
                    <label key={m.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${ligado ? "border-brand bg-brand/5" : "border-gray-200 bg-white"}`}>
                      <input type="checkbox" className="mt-1 h-5 w-5" checked={ligado} onChange={(e) => alternarModulo(m.grupos, e.target.checked)} aria-label={`Módulo ${m.nome}`} />
                      <span>
                        <span className="block text-sm font-semibold text-gray-800">{m.nome} <span className="font-normal text-gray-500">· {ligado ? `${ativas} de ${total} telas` : "desligado"}</span></span>
                        <span className="block text-xs text-gray-500">{m.ajuda}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Secao>

            <Secao titulo="Telas" ajuda="Dentro de cada módulo ligado: sem acesso, só ver (consulta) ou editar (consulta e altera). O financeiro restrito só entra por aqui, nunca pelo papel.">
              <div className={`grid gap-4 ${ehAdmin ? "pointer-events-none opacity-50" : ""}`}>
                {MODULOS_TOPO.every((m) => !moduloLigado(m.grupos)) && !ehAdmin && <p className="text-sm text-gray-500">Nenhum módulo ligado. Ligue um módulo acima ou aplique um perfil pronto.</p>}
                {dados.grupos.filter((g) => g.id !== "admin" && MODULOS_TOPO.some((m) => m.grupos.includes(g.id) && moduloLigado(m.grupos))).map((g) => (
                  <div key={g.id}>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${g.id === "financeiro" ? "text-amber-700" : "text-gray-500"}`}>{g.nome}</p>
                    <p className="mb-1 text-xs text-gray-400">{g.ajuda}</p>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                      {modulosEditaveis.filter((m) => m.grupo === g.id).map((m) => {
                        const n = niveis[m.id] ?? null;
                        return (
                          <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{m.label}</p>
                              <p className="text-xs text-gray-500">{m.descricao}</p>
                            </div>
                            <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs font-medium" role="radiogroup" aria-label={`Acesso a ${m.label}`}>
                              {([[null, "Sem acesso"], ["VER", "Só ver"], ["EDITAR", "Editar"]] as [Nivel | null, string][]).map(([v, nome]) => (
                                <button key={nome} type="button" role="radio" aria-checked={n === v} onClick={() => mudarNivel(m.id, v)}
                                  className={`px-3 py-1.5 ${n === v ? (v === null ? "bg-gray-200 text-gray-800" : v === "VER" ? "bg-sky-600 text-white" : "bg-brand text-white") : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                                  {nome}
                                </button>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Secao>

            <div className="grid gap-4 lg:grid-cols-2">
              <Secao titulo="Projetos" ajuda="Qual a visão da pessoa e quais projetos específicos ela recebe, além do que já participa.">
                <div className="grid gap-2">
                  {(Object.keys(ESCOPO_ROTULO) as Escopo[]).map((k) => (
                    <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${escopo === k ? "border-brand bg-brand/5" : "border-gray-200"}`}>
                      <input type="radio" name="escopo" checked={escopo === k} onChange={() => setEscopo(k)} className="mt-1" />
                      <span><span className="block text-sm font-medium text-gray-800">{ESCOPO_ROTULO[k].nome}</span><span className="block text-xs text-gray-500">{ESCOPO_ROTULO[k].ajuda}</span></span>
                    </label>
                  ))}
                </div>
                <label className={`${rot} mt-4`}>Projetos liberados para ela ({projetos.size})</label>
                <input className={campo} placeholder="Buscar projeto ou equipe…" value={buscaProjeto} onChange={(e) => setBuscaProjeto(e.target.value)} />
                <ul className="mt-2 max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  {projetosFiltrados.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-gray-50">
                        <input type="checkbox" checked={projetos.has(p.id)} onChange={() => setProjetos(alternar(projetos, p.id))} />
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.equipe && <span className="text-xs text-gray-400">{p.equipe}</span>}
                      </label>
                    </li>
                  ))}
                  {projetosFiltrados.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Nenhum projeto encontrado.</li>}
                </ul>
              </Secao>

              <Secao titulo="Contratos" ajuda="Quais contratos (centros de custo) a pessoa enxerga, e onde: nos projetos (demandas), no financeiro (custos, medição, previsão) ou nos dois.">
                <label className={`flex items-start gap-2 rounded-lg border p-2.5 ${verTodos || dados.contratos.verTodosPeloPapel ? "border-brand bg-brand/5" : "border-gray-200"}`}>
                  <input type="checkbox" className="mt-1" checked={verTodos || dados.contratos.verTodosPeloPapel} disabled={dados.contratos.verTodosPeloPapel} onChange={(e) => setVerTodos(e.target.checked)} />
                  <span><span className="block text-sm font-medium text-gray-800">Vê todos os contratos</span>
                    <span className="block text-xs text-gray-500">{dados.contratos.verTodosPeloPapel ? "O papel Administrador/Diretor já vê todos." : "Sem marcar, vê só os escolhidos abaixo e os das equipes em que participa."}</span></span>
                </label>
                <div className={verTodos || dados.contratos.verTodosPeloPapel ? "pointer-events-none opacity-40" : ""}>
                  <label className={`${rot} mt-4`}>Contratos liberados ({Object.keys(contratos).length})</label>
                  <input className={campo} placeholder="Buscar contrato ou CCU…" value={buscaContrato} onChange={(e) => setBuscaContrato(e.target.value)} />
                  <ul className="mt-2 max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
                    {contratosFiltrados.map((c) => {
                      const area = contratos[c.codccu];
                      return (
                        <li key={c.codccu} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                          <input type="checkbox" checked={!!area} onChange={(e) => setContratos((x) => { const n = { ...x }; if (e.target.checked) n[c.codccu] = "AMBOS"; else delete n[c.codccu]; return n; })} aria-label={`Liberar ${c.nome}`} />
                          <span className="flex-1 truncate"><span className="font-mono text-xs text-gray-400">{c.codccu}</span> {c.nome}</span>
                          {area && (
                            <select value={area} onChange={(e) => setContratos((x) => ({ ...x, [c.codccu]: e.target.value as Area }))} className="rounded border border-gray-300 px-1.5 py-0.5 text-xs" aria-label={`Onde vale ${c.nome}`}>
                              {(Object.keys(AREA_ROTULO) as Area[]).map((a) => <option key={a} value={a}>{AREA_ROTULO[a]}</option>)}
                            </select>
                          )}
                        </li>
                      );
                    })}
                    {contratosFiltrados.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Nenhum contrato encontrado.</li>}
                  </ul>
                </div>
              </Secao>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Secao titulo="Núcleos" ajuda="O coordenador associa projetos, passa tarefas e controla as demandas do núcleo; o gerente enxerga tudo do núcleo.">
                <label className={rot}>Pertence ao núcleo</label>
                <select className={campo} value={membroDe ?? ""} onChange={(e) => setMembroDe(e.target.value || null)}>
                  <option value="">Nenhum</option>
                  {nucleosLista.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                <div className="mt-2 flex items-center gap-2">
                  <input className={campo} placeholder={nucleosLista.length === 0 ? "Nenhum núcleo cadastrado: digite o nome para criar" : "Criar um núcleo novo…"} value={novoNucleo} onChange={(e) => setNovoNucleo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criarNucleo(); } }} />
                  <button type="button" onClick={criarNucleo} className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Criar núcleo</button>
                </div>
                {erroNucleo && <p className="mt-1 text-xs text-red-600">{erroNucleo}</p>}
                <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
                  {nucleosLista.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex-1 font-medium text-gray-800">{n.name}</span>
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={coordenador.has(n.id)} onChange={() => setCoordenador(alternar(coordenador, n.id))} /> Coordenador</label>
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={gerente.has(n.id)} onChange={() => setGerente(alternar(gerente, n.id))} /> Gerente</label>
                    </li>
                  ))}
                  {nucleosLista.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Quando houver núcleos, marque aqui quem coordena e quem gerencia cada um.</li>}
                </ul>
              </Secao>

              <Secao titulo="Usuário do Senior" ajuda="Define quais OCs a pessoa vê em Aprovações de OC. Busque o login do Senior e vincule; o mesmo login pode valer para mais de uma pessoa.">
                <div className="flex flex-wrap gap-2">
                  {senior.map((s) => (
                    <span key={s.codigo} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs text-brand-dark">
                      <b>{s.nome}</b> #{s.codigo}
                      {s.tambemUsam.length > 0 && <span className="text-gray-500">· também: {s.tambemUsam.join(", ")}</span>}
                      <button type="button" onClick={() => setSenior(senior.filter((x) => x.codigo !== s.codigo))} aria-label={`Remover ${s.nome}`} className="ml-1 text-gray-500 hover:text-red-600">×</button>
                    </span>
                  ))}
                  {senior.length === 0 && <p className="text-xs text-gray-400">Nenhum usuário do Senior vinculado: a pessoa não verá OCs em Aprovações de OC.</p>}
                </div>
                {dados.senior.sugestoes.filter((s) => !senior.some((x) => x.codigo === s.codigo)).map((s) => (
                  <p key={s.codigo} className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    O sistema tem este vínculo automático: <b>{s.nome}</b> #{s.codigo}. Confira antes de usar.{" "}
                    <button type="button" className="font-semibold underline" onClick={() => setSenior([...senior, { codigo: s.codigo, nome: s.nome, tambemUsam: [] }])}>Usar</button>
                  </p>
                ))}
                <label className={`${rot} mt-4`}>Buscar no Senior (login ou código)</label>
                <input className={campo} placeholder="Ex.: julimar ou 26" value={buscaSenior} onChange={(e) => setBuscaSenior(e.target.value)} />
                {achadosSenior && (
                  <ul className="mt-2 max-h-44 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
                    {achadosSenior.map((a) => (
                      <li key={a.codigo} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                        <span className="flex-1"><b>{a.nome}</b> <span className="text-xs text-gray-400">#{a.codigo}</span>
                          {a.usadoPor.length > 0 && <span className="ml-1 text-xs text-gray-500">· já usado por {a.usadoPor.join(", ")}</span>}</span>
                        <button type="button" disabled={senior.some((x) => x.codigo === a.codigo)} onClick={() => setSenior([...senior, { codigo: a.codigo, nome: a.nome, tambemUsam: a.usadoPor }])}
                          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-40">{senior.some((x) => x.codigo === a.codigo) ? "Vinculado" : "Vincular"}</button>
                      </li>
                    ))}
                    {achadosSenior.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Ninguém encontrado.</li>}
                  </ul>
                )}
              </Secao>
            </div>
          </div>
        )}

        {dados && (
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-gray-200 bg-white px-6 py-3">
            <p className="text-xs text-gray-500">{resumo}</p>
            <div className="flex items-center gap-3">
              {erro && <span className="text-sm text-red-600">{erro}</span>}
              <button onClick={onFechar} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{salvando ? "Salvando…" : "Salvar acesso"}</button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
