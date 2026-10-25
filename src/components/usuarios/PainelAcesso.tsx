"use client";

// Painel de acesso de UMA pessoa (so' o ADMIN abre): perfil pronto, telas de cada modulo em lista suspensa (sem acesso / so' ver / editar),
// visao dos projetos, projetos liberados, contratos (nos projetos e no financeiro), nucleos e vinculo com o usuario do Senior. Grava tudo de
// uma vez em PUT /api/users/[id]/acesso. Serve a duas telas: "Acesso" da lista de usuarios (userId) e "Novo usuario" (userId nulo), que cria a
// pessoa (POST /api/users) e logo em seguida grava o acesso, na mesma janela.
import { useEffect, useMemo, useState } from "react";
import { AREAS, AREA_POR_CCU } from "@/lib/areas";
import { AVATAR_PALETTE } from "@/components/Avatar";

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
  nucleos: { todos: { id: string; name: string }[]; membroDe: string | null; gerente: string[]; coordenador: string[]; diretor?: string[] };
  senior: { vinculos: { codigo: string; nome: string; tambemUsam: string[] }[]; sugestoes: { codigo: string; nome: string }[]; automatico?: { codigo: string; nome: string } | null };
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
const NIVEL_ROTULO: Record<string, string> = { DIRETORIA: "Diretoria", GERENCIA: "Gerência", COORDENACAO: "Coordenação", SUPERVISOR: "Supervisor", COLABORADOR: "Colaborador" };
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

type Pessoa = { nome: string; email: string; senha: string; cargo: string; diretoria: string; ramal: string; whatsapp: string; gestorId: string; dataInicio: string; nivel: string; cor: string };
const PESSOA_VAZIA: Pessoa = { nome: "", email: "", senha: "", cargo: "", diretoria: "", ramal: "", whatsapp: "", gestorId: "", dataInicio: "", nivel: "", cor: AVATAR_PALETTE[0] };

// mensagem legivel de uma resposta de erro da API (zod: fieldErrors / formErrors, ou texto)
async function mensagemDeErro(r: Response, padrao: string): Promise<string> {
  const j = await r.json().catch(() => null);
  const e = j?.error;
  if (e?.fieldErrors) {
    const m = Object.entries(e.fieldErrors as Record<string, string[]>).filter(([, v]) => v?.length).map(([k, v]) => `${k}: ${v.join(", ")}`);
    if (m.length) return m.join(" · ");
  }
  if (e?.formErrors?.length) return e.formErrors.join(", ");
  return typeof e === "string" ? e : padrao;
}

export default function PainelAcesso({ userId, usuarios, onFechar, onSalvo }: { userId: string | null; usuarios?: { id: string; name: string }[]; onFechar: () => void; onSalvo?: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // "Novo usuario": sem id ainda; depois de criado a pessoa passa a existir e um novo clique em Salvar so' regrava o acesso
  const [idCriado, setIdCriado] = useState<string | null>(null);
  const idAlvo = userId ?? idCriado;
  const criando = userId === null && idCriado === null;
  const [pessoa, setPessoa] = useState<Pessoa>(PESSOA_VAZIA);
  const mudaPessoa = (campoNome: keyof Pessoa, v: string) => setPessoa((x) => ({ ...x, [campoNome]: v }));

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
  const [diretor, setDiretor] = useState<Set<string>>(new Set());
  const [senior, setSenior] = useState<{ codigo: string; nome: string; tambemUsam: string[] }[]>([]);
  const [buscaProjeto, setBuscaProjeto] = useState("");
  const [buscaContrato, setBuscaContrato] = useState("");
  const [buscaSenior, setBuscaSenior] = useState("");
  const [achadosSenior, setAchadosSenior] = useState<{ codigo: string; nome: string; usadoPor: string[] }[] | null>(null);
  const [perfilAplicado, setPerfilAplicado] = useState<string | null>(null);
  const [msgSenior, setMsgSenior] = useState("");
  const [msgContratos, setMsgContratos] = useState("");
  const [puxando, setPuxando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(userId ? `/api/users/${userId}/acesso` : "/api/acesso/catalogo").then(async (r) => {
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
      setDiretor(new Set(d.nucleos.diretor ?? []));
      setSenior(d.senior.vinculos);
    });
    return () => { vivo = false; };
  }, [userId]);

  // login do Senior igual ao e-mail da pessoa (a parte antes do @): ao digitar o e-mail de um usuario novo e pelo botao
  async function vincularPelaEmail(auto: boolean) {
    const email = (userId === null && !idCriado ? pessoa.email : dados?.usuario.email ?? pessoa.email).trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { if (!auto) setMsgSenior("Digite o e-mail da pessoa primeiro."); return; }
    const r = await fetch(`/api/acesso/senior?email=${encodeURIComponent(email)}`).catch(() => null);
    if (!r || !r.ok) { if (!auto) setMsgSenior("Não foi possível consultar o Senior agora. Tente de novo."); return; }
    const a = (await r.json().catch(() => null))?.porEmail as { codigo: string; nome: string; usadoPor: string[] } | null | undefined;
    if (!a) { setMsgSenior(auto ? "" : "Não achei login do Senior igual a este e-mail. Use a busca abaixo."); return; }
    setSenior((x) => (x.some((s) => s.codigo === a.codigo) ? x : [...x, { codigo: a.codigo, nome: a.nome, tambemUsam: a.usadoPor }]));
    setMsgSenior(`Achei pelo e-mail: ${a.nome} #${a.codigo}.${userId === null && !idCriado ? " Vai junto ao criar o usuário." : " Clique em Salvar acesso para gravar."}`);
  }
  useEffect(() => {
    if (!(userId === null && !idCriado) || !/^\S+@\S+\.\S+$/.test(pessoa.email.trim())) return;
    const t = setTimeout(() => { void vincularPelaEmail(true); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoa.email, userId, idCriado]);

  // marca os contratos em que o(s) login(s) do Senior vinculados aprovam OC como coordenacao ou gerencia (niveis 1 e 2 da alcada)
  async function puxarContratosDoSenior() {
    if (senior.length === 0) return;
    setPuxando(true); setMsgContratos("");
    try {
      const r = await fetch(`/api/acesso/senior/contratos?codigos=${senior.map((s) => s.codigo).join(",")}&niveis=1,2`);
      const j = await r.json().catch(() => null);
      if (!r.ok) return setMsgContratos(typeof j?.error === "string" ? j.error : "Não consegui consultar o Senior agora.");
      const existentes = new Set((dados?.contratos.disponiveis ?? []).map((c) => c.codccu));
      const achados = ((j?.ccus ?? []) as { codccu: string }[]).map((c) => c.codccu);
      const marcar = achados.filter((c) => existentes.has(c));
      setContratos((x) => { const n = { ...x }; for (const c of marcar) n[c] = n[c] ?? "AMBOS"; return n; });
      const fora = achados.length - marcar.length;
      setMsgContratos(achados.length === 0 ? "Nenhum contrato encontrado: este login não está na alçada de aprovação de OC como coordenação nem gerência." : `${marcar.length} contrato(s) marcado(s) onde aprova como coordenação ou gerência.${fora ? ` ${fora} do Senior não estão na lista do sistema.` : ""} Clique em Salvar acesso para gravar.`);
    } catch {
      setMsgContratos("Não consegui consultar o Senior agora.");
    } finally {
      setPuxando(false);
    }
  }

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
    setEscopo("PROPRIOS");
    if (p.verTodosContratos !== undefined) setVerTodos(p.verTodosContratos);
  }
  // Modulos que aparecem na tela inicial: nem todo mundo ve todos. Ligar traz as telas comuns do modulo; o financeiro restrito nunca vem junto.
  const MODULOS_TOPO = [
    { id: "gestao", nome: "Módulo Projetos e Gestão", ajuda: "Projetos, tarefas, sprint, Gantt, calendário, metas, PDI e relatórios.", grupos: ["gestao"], ordem: ["gestao"] },
    { id: "financeiro", nome: "Módulo Financeiro e Contratos", ajuda: "Contratos, custos, medição, previsão, Aprovações de OC e, só para o time financeiro, os pagamentos.", grupos: ["financeiro", "contratos"], ordem: ["contratos", "financeiro"] },
  ];
  const idsDoModulo = (grupos: string[]) => modulosEditaveis.filter((m) => grupos.includes(m.grupo));
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
  // atalhos: marcar de uma vez todos os contratos de uma area (Engenharia, Ambiental, Administrativo), usando a mesma separacao do filtro "Contratos"
  const porArea = useMemo(() => AREAS.map((a) => ({ ...a, ccus: (dados?.contratos.disponiveis ?? []).filter((x) => AREA_POR_CCU[x.codccu] === a.valor).map((x) => x.codccu) })), [dados]);
  function marcarArea(ccus: string[], marcar: boolean) {
    setContratos((x) => { const n = { ...x }; for (const c of ccus) { if (marcar) n[c] = n[c] ?? "AMBOS"; else delete n[c]; } return n; });
  }
  const contratosFiltrados = useMemo(() => {
    const t = buscaContrato.trim().toLowerCase();
    return (dados?.contratos.disponiveis ?? []).filter((c) => !t || `${c.codccu} ${c.nome}`.toLowerCase().includes(t));
  }, [dados, buscaContrato]);

  async function salvar() {
    if (!dados) return;
    setErro("");
    let id = idAlvo;
    if (!id) {
      if (pessoa.nome.trim().length < 2) return setErro("Digite o nome da pessoa.");
      if (!/^\S+@\S+\.\S+$/.test(pessoa.email.trim())) return setErro("Digite um e-mail válido.");
      if (pessoa.senha.length < 8) return setErro("A senha provisória precisa de pelo menos 8 caracteres.");
    }
    setSalvando(true);
    try {
      const eraCriacao = !id;
      if (!id) {
        const c = await fetch("/api/users", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pessoa.nome.trim(), email: pessoa.email.trim(), password: pessoa.senha, role: papel, avatarColor: pessoa.cor,
            cargo: pessoa.cargo || undefined, diretoria: pessoa.diretoria || undefined, ramal: pessoa.ramal || undefined, whatsapp: pessoa.whatsapp || undefined,
            gestorImediatoId: pessoa.gestorId || undefined, dataInicio: pessoa.dataInicio ? new Date(pessoa.dataInicio).toISOString() : undefined,
            nivelHierarquico: pessoa.nivel || undefined,
          }),
        });
        if (!c.ok) return setErro(await mensagemDeErro(c, "Não foi possível criar o usuário."));
        id = (await c.json().catch(() => null))?.id ?? null;
        if (!id) return setErro("O usuário foi criado, mas a resposta veio incompleta. Abra “Acesso” na linha dele para definir as telas.");
        setIdCriado(id);
        onSalvo?.();
      }
      const acessos = Object.entries(niveis).filter(([, n]) => n).map(([modulo, nivel]) => ({ modulo, nivel }));
      const r = await fetch(`/api/users/${id}/acesso`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: papel !== dados.usuario.role || eraCriacao ? papel : undefined,
          acessos, escopoProjetos: "PROPRIOS", projetos: Array.from(projetos),
          contratos: { verTodos, itens: Object.entries(contratos).map(([codccu, area]) => ({ codccu, area })) },
          nucleos: { membroDe, gerente: Array.from(gerente), coordenador: Array.from(coordenador), diretor: Array.from(diretor) },
          senior: senior.map((s) => s.codigo),
        }),
      });
      if (!r.ok) return setErro(`${userId === null ? "O usuário foi criado, mas o acesso não foi salvo: " : ""}${await mensagemDeErro(r, "não foi possível salvar. Confira os campos.")}${userId === null ? " Corrija e clique em Salvar de novo." : ""}`);
      onSalvo?.();
      onFechar();
    } catch {
      setErro("Não foi possível conectar ao servidor. Tente de novo em alguns segundos.");
    } finally {
      setSalvando(false);
    }
  }

  const resumo = dados
    ? `${Object.values(niveis).filter(Boolean).length} telas · ${projetos.size} projetos liberados · ${verTodos ? "todos os contratos" : `${Object.keys(contratos).length} contratos`} · ${senior.length} usuário(s) do Senior`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Acesso do usuário">
      <div className="my-6 w-full max-w-5xl rounded-2xl bg-gray-50 shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-t-2xl border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{userId === null ? "Novo usuário" : "Acesso do usuário"}</p>
            <h2 className="text-xl font-semibold text-gray-900">{userId === null ? (pessoa.nome.trim() || "Dados e acesso da nova pessoa") : dados?.usuario.name ?? "Carregando…"}</h2>
            {userId === null
              ? <p className="text-sm text-gray-500">{idCriado ? "Usuário criado. Falta só gravar o acesso." : "Preencha os dados e escolha o que a pessoa vê. Tudo é gravado ao clicar em “Criar usuário”."}</p>
              : dados && <p className="text-sm text-gray-500">{dados.usuario.email}</p>}
          </div>
          <button onClick={onFechar} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{userId === null && !idCriado ? "Cancelar" : "Fechar"}</button>
        </header>

        {!dados && !erro && <p className="p-6 text-sm text-gray-500">Carregando…</p>}
        {!dados && erro && <p className="p-6 text-sm text-red-600">{erro}</p>}

        {dados && (
          <div className="grid gap-4 p-6">
            {criando && (
              <Secao titulo="Dados da pessoa" ajuda="Nome, e-mail e uma senha provisória (a pessoa troca no primeiro acesso). O restante é opcional.">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div><label className={rot}>Nome *</label><input className={campo} value={pessoa.nome} onChange={(e) => mudaPessoa("nome", e.target.value)} autoComplete="off" /></div>
                  <div><label className={rot}>E-mail *</label><input className={campo} type="email" value={pessoa.email} onChange={(e) => mudaPessoa("email", e.target.value)} autoComplete="off" /></div>
                  <div><label className={rot}>Senha provisória * (mín. 8)</label><input className={campo} type="password" value={pessoa.senha} onChange={(e) => mudaPessoa("senha", e.target.value)} autoComplete="new-password" /></div>
                  <div><label className={rot}>Cargo</label><input className={campo} value={pessoa.cargo} onChange={(e) => mudaPessoa("cargo", e.target.value)} /></div>
                  <div><label className={rot}>Diretoria</label><input className={campo} value={pessoa.diretoria} onChange={(e) => mudaPessoa("diretoria", e.target.value)} /></div>
                  <div><label className={rot}>Gestor imediato</label>
                    <select className={campo} value={pessoa.gestorId} onChange={(e) => mudaPessoa("gestorId", e.target.value)}>
                      <option value="">Nenhum</option>
                      {(usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select></div>
                  <div><label className={rot}>Ramal</label><input className={campo} value={pessoa.ramal} onChange={(e) => mudaPessoa("ramal", e.target.value)} /></div>
                  <div><label className={rot}>WhatsApp</label><input className={campo} value={pessoa.whatsapp} onChange={(e) => mudaPessoa("whatsapp", e.target.value)} /></div>
                  <div><label className={rot}>Data de início</label><input className={campo} type="date" value={pessoa.dataInicio} onChange={(e) => mudaPessoa("dataInicio", e.target.value)} /></div>
                  <div><label className={rot}>Nível hierárquico</label>
                    <select className={campo} value={pessoa.nivel} onChange={(e) => mudaPessoa("nivel", e.target.value)}>
                      <option value="">Não informado</option>
                      {Object.entries(NIVEL_ROTULO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select></div>
                  <div><label className={rot}>Cor do avatar</label>
                    <div className="flex items-center gap-1.5 py-1">
                      {AVATAR_PALETTE.map((c) => (
                        <button type="button" key={c} onClick={() => mudaPessoa("cor", c)} aria-label={`Cor ${c}`} className={`h-6 w-6 rounded-full ${pessoa.cor === c ? "ring-2 ring-offset-1 ring-gray-500" : ""}`} style={{ backgroundColor: c }} />
                      ))}
                    </div></div>
                </div>
              </Secao>
            )}
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

            <Secao titulo="Módulos e telas" ajuda="Em cada módulo, escolha na lista de cada tela o que a pessoa vê: sem acesso, só ver (consulta) ou editar (consulta e altera). O módulo sem nenhuma tela liberada nem aparece na tela inicial dela. O financeiro de pagamento só entra por aqui, nunca pelo papel.">
              <div className={`grid gap-4 xl:grid-cols-2 ${ehAdmin ? "pointer-events-none opacity-50" : ""}`}>
                {MODULOS_TOPO.map((m) => {
                  const total = idsDoModulo(m.grupos).length;
                  const ativas = idsDoModulo(m.grupos).filter((x) => niveis[x.id]).length;
                  return (
                    <div key={m.id} className="rounded-xl border border-gray-200 bg-white" data-modulo={m.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800">{m.nome}</p>
                          <p className="text-xs text-gray-500">{m.ajuda}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={`rounded-full px-2 py-1 font-medium ${ativas ? "bg-brand/10 text-brand-dark" : "bg-gray-100 text-gray-500"}`}>{ativas ? `${ativas} de ${total} telas` : "Desligado"}</span>
                          <button type="button" onClick={() => alternarModulo(m.grupos, true)} className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-50">Liberar as comuns</button>
                          <button type="button" onClick={() => alternarModulo(m.grupos, false)} className="rounded-md border border-gray-300 px-2 py-1 text-gray-500 hover:bg-gray-50">Limpar</button>
                        </div>
                      </div>
                      <div className="grid gap-3 p-3">
                        {m.ordem.map((gid) => {
                          const g = dados.grupos.find((x) => x.id === gid);
                          if (!g) return null;
                          return (
                            <div key={gid}>
                              <p className={`text-xs font-semibold uppercase tracking-wide ${gid === "financeiro" ? "text-amber-700" : "text-gray-500"}`}>{g.nome}</p>
                              <p className="mb-1 text-xs text-gray-400">{g.ajuda}</p>
                              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                                {modulosEditaveis.filter((x) => x.grupo === gid).map((x) => {
                                  const n = niveis[x.id] ?? null;
                                  return (
                                    <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-800">{x.label}</p>
                                        <p className="text-xs text-gray-500">{x.descricao}</p>
                                      </div>
                                      <select
                                        value={n ?? ""}
                                        onChange={(e) => mudarNivel(x.id, (e.target.value || null) as Nivel | null)}
                                        aria-label={`Acesso a ${x.label}`}
                                        className={`rounded-md border px-2 py-1.5 text-xs font-medium ${n === "EDITAR" ? "border-brand bg-brand/10 text-brand-dark" : n === "VER" ? "border-sky-400 bg-sky-50 text-sky-800" : "border-gray-300 bg-white text-gray-600"}`}
                                      >
                                        <option value="">Sem acesso</option>
                                        <option value="VER">Só ver</option>
                                        <option value="EDITAR">Editar</option>
                                      </select>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {ehAdmin && <p className="mt-2 text-xs text-amber-700">Administrador acessa tudo; as telas acima não se aplicam.</p>}
            </Secao>

            <div className="grid gap-4 lg:grid-cols-2">
              <Secao titulo="Projetos" ajuda="Quais projetos específicos ela recebe por convite, além do que já participa.">
                <p className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600">
                  <b className="text-gray-800">Projetos são particulares.</b> Cada pessoa vê só os que criou, os de que faz parte da equipe, os que recebeu por convite (abaixo)
                  e os que tem tarefa. Nunca os de outra pessoa, nem do mesmo núcleo. Só administradores veem todos.
                </p>
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
                  <div className="mb-2 flex flex-wrap items-center gap-2 pointer-events-auto">
                    <button type="button" onClick={puxarContratosDoSenior} disabled={senior.length === 0 || puxando} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50">{puxando ? "Consultando o Senior…" : "Puxar do Senior onde ele aprova"}</button>
                    <span className="text-xs text-gray-500">{msgContratos || (senior.length ? "Marca os contratos em que o login do Senior aprova OC como coordenação ou gerência (níveis 1 e 2)." : "Vincule o usuário do Senior (seção Usuário do Senior) para usar.")}</span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {porArea.map((a) => {
                      const todos = a.ccus.length > 0 && a.ccus.every((c) => contratos[c]);
                      return (
                        <button key={a.valor} type="button" disabled={a.ccus.length === 0} onClick={() => marcarArea(a.ccus, !todos)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${todos ? "border-brand bg-brand/10 text-brand-dark" : "border-gray-300 hover:bg-gray-50"}`}>
                          {todos ? "✓ " : "+ "}{a.rotulo} ({a.ccus.length})
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setContratos({})} className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50">Limpar</button>
                  </div>
                  <input className={campo} placeholder="Buscar contrato ou CCU…" value={buscaContrato} onChange={(e) => setBuscaContrato(e.target.value)} />
                  <ul className="mt-2 max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
                    {contratosFiltrados.map((c) => {
                      const area = contratos[c.codccu];
                      return (
                        <li key={c.codccu} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                          <input type="checkbox" checked={!!area} onChange={(e) => setContratos((x) => { const n = { ...x }; if (e.target.checked) n[c.codccu] = "AMBOS"; else delete n[c.codccu]; return n; })} aria-label={`Liberar ${c.nome}`} />
                          <span className="flex-1 truncate"><span className="font-mono text-xs text-gray-400">{c.codccu}</span> {c.nome}{AREA_POR_CCU[c.codccu] && <span className="ml-1 text-[10px] uppercase text-gray-400">{AREA_POR_CCU[c.codccu].slice(0, 3)}</span>}</span>
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
              <Secao titulo="Núcleos" ajuda="O coordenador associa projetos, passa tarefas e controla as demandas do núcleo; o gerente e o diretor enxergam tudo do núcleo.">
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
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={diretor.has(n.id)} onChange={() => setDiretor(alternar(diretor, n.id))} /> Diretor</label>
                    </li>
                  ))}
                  {nucleosLista.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Quando houver núcleos, marque aqui quem coordena e quem gerencia cada um.</li>}
                </ul>
              </Secao>

              <Secao titulo="Usuário do Senior" ajuda="Define quais OCs a pessoa vê em Aprovações de OC. Se o e-mail dela for igual ao do usuário no Senior, o vínculo é automático. Se escolher um login aqui, ele vale no lugar do automático; o mesmo login pode valer para mais de uma pessoa.">
                <div className="flex flex-wrap gap-2">
                  {senior.map((s) => (
                    <span key={s.codigo} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs text-brand-dark">
                      <b>{s.nome}</b> #{s.codigo}
                      {s.tambemUsam.length > 0 && <span className="text-gray-500">· também: {s.tambemUsam.join(", ")}</span>}
                      <button type="button" onClick={() => setSenior(senior.filter((x) => x.codigo !== s.codigo))} aria-label={`Remover ${s.nome}`} className="ml-1 text-gray-500 hover:text-red-600">×</button>
                    </span>
                  ))}
                  {senior.length === 0 && !dados.senior.automatico && <p className="text-xs text-gray-400">Nenhum usuário do Senior vinculado e nenhum com o mesmo e-mail: a pessoa não verá OCs em Aprovações de OC.</p>}
                </div>
                {dados.senior.automatico && (
                  <p className={`mt-2 rounded-md px-2.5 py-1.5 text-xs ${senior.length === 0 ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-500"}`}>
                    {senior.length === 0
                      ? <>Vínculo automático pelo e-mail: <b>{dados.senior.automatico.nome}</b> #{dados.senior.automatico.codigo}. Vale enquanto você não escolher outro login aqui.</>
                      : <>O vínculo automático pelo e-mail (<b>{dados.senior.automatico.nome}</b> #{dados.senior.automatico.codigo}) não vale enquanto houver login escolhido aqui.</>}
                  </p>
                )}
                {dados.senior.sugestoes.filter((s) => !senior.some((x) => x.codigo === s.codigo)).map((s) => (
                  <p key={s.codigo} className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    O sistema tem este vínculo automático: <b>{s.nome}</b> #{s.codigo}. Confira antes de usar.{" "}
                    <button type="button" className="font-semibold underline" onClick={() => setSenior([...senior, { codigo: s.codigo, nome: s.nome, tambemUsam: [] }])}>Usar</button>
                  </p>
                ))}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => vincularPelaEmail(false)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">Vincular pelo e-mail</button>
                  <span className="text-xs text-gray-500">{msgSenior || "Procura o usuário do Senior com o mesmo e-mail (ou o login igual à parte antes do @)."}</span>
                </div>
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
              <button onClick={onFechar} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">{userId === null && idCriado ? "Fechar" : "Cancelar"}</button>
              <button onClick={salvar} disabled={salvando} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{salvando ? "Salvando…" : userId === null && !idCriado ? "Criar usuário e salvar acesso" : "Salvar acesso"}</button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
