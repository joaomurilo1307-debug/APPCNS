"use client";

import { useMemo, useRef, useState } from "react";
import {
  STATUS_EQUIPE,
  STATUS_VAGA,
  TIPOS_AUSENCIA,
  estadoDaVaga,
  indexar,
  ordenarGrupos,
  temNome,
  type DadosEfetivos,
} from "@/lib/efetivos/disponibilidade";
import { COR_DISPONIBILIDADE, chamar, fmtDia, hojeBr, type DadosTela, type Equipe, type Vaga } from "./comum";
import { Aviso, Modal, campo } from "./ui";

type Props = { dados: DadosTela; regra: DadosEfetivos; recarregar: () => Promise<void>; ocultarNomes: boolean };

const COR_SITUACAO: Record<string, string> = {
  LIVRE: "bg-emerald-100 text-emerald-800",
  ALOCADA: "bg-sky-100 text-sky-800",
  AUSENTE: "bg-red-100 text-red-700",
  VAGA_ABERTA: "bg-amber-100 text-amber-800",
};
const ROTULO_SITUACAO: Record<string, string> = { LIVRE: "Livre", ALOCADA: "Escalada", AUSENTE: "Ausente", VAGA_ABERTA: "Vaga aberta" };
const A_DEFINIR = "A definir";

function dataDoNomeDoArquivo(nome: string): string | null {
  const m = /(\d{2})_(\d{2})_(\d{4})/.exec(nome);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export default function Efetivos({ dados, regra, recarregar, ocultarNomes }: Props) {
  const hoje = hojeBr();
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const projetos = Array.from(new Set(dados.equipes.map((e) => e.projeto).filter((p) => p !== A_DEFINIR)));
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok" | "atencao"; texto: string } | null>(null);
  const [editarEquipe, setEditarEquipe] = useState<Equipe | "nova" | null>(null);
  const [novaVagaEm, setNovaVagaEm] = useState<Equipe | null>(null);
  const [detalhes, setDetalhes] = useState<Vaga | null>(null);
  const [ausenciasDe, setAusenciasDe] = useState<Vaga | null>(null);

  const idx = useMemo(() => indexar(regra), [regra]);
  const vagasPorEquipe = useMemo(() => {
    const m = new Map<string, Vaga[]>();
    for (const v of dados.vagas) {
      if (!m.has(v.equipeId)) m.set(v.equipeId, []);
      m.get(v.equipeId)!.push(v);
    }
    return m;
  }, [dados.vagas]);

  const t = busca.trim().toLowerCase();
  const equipesVisiveis = dados.equipes.filter((e) => {
    if (filtroGrupo && e.grupo !== filtroGrupo) return false;
    if (!t) return true;
    return `${e.codigo} ${e.nome} ${e.projeto}`.toLowerCase().includes(t) || (vagasPorEquipe.get(e.id) ?? []).some((v) => (v.nome ?? "").toLowerCase().includes(t) || v.cargo.toLowerCase().includes(t));
  });
  const semContrato = dados.equipes.filter((e) => e.projeto === A_DEFINIR).length;

  async function alterarVaga(v: Vaga, corpo: Record<string, unknown>) {
    const r = await chamar("PATCH", `/api/efetivos/vagas/${v.id}`, corpo);
    if (!r.ok) {
      setMensagem({ tipo: "erro", texto: r.dados.error ?? "Não foi possível salvar" });
      return false;
    }
    if ((r.dados as any).alocacoesFuturas > 0) {
      setMensagem({ tipo: "atencao", texto: `Profissional trocado. Esta vaga tem ${(r.dados as any).alocacoesFuturas} escala(s) em campanha: elas continuam na vaga, revise em Campanhas se for outra pessoa.` });
    }
    await recarregar();
    return true;
  }

  const nomeDe = (v: Vaga) => (ocultarNomes ? v.cargo : v.nome ?? "—");

  return (
    <div className="space-y-4">
      {mensagem && (
        <div onClick={() => setMensagem(null)} className="cursor-pointer">
          <Aviso tipo={mensagem.tipo}>{mensagem.texto} <span className="text-xs opacity-60">(clique para fechar)</span></Aviso>
        </div>
      )}

      {dados.podeEditar && <ImportarPlanilha recarregar={recarregar} temEquipes={dados.equipes.length > 0} />}

      {dados.podeEditar && semContrato > 0 && (
        <Aviso tipo="atencao">
          <strong>{semContrato}</strong> equipe{semContrato > 1 ? "s" : ""} sem contrato definido (“{A_DEFINIR}”). A planilha não informa o contrato de cada equipe: clique em <strong>Editar equipe</strong> e informe o projeto/CT — as viaturas dessa equipe acompanham.
        </Aviso>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <label className="text-xs text-gray-500">
          Grupo
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Buscar equipe, cargo ou nome
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <button onClick={() => setAbertas(abertas.size ? new Set() : new Set(equipesVisiveis.map((e) => e.id)))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          {abertas.size ? "Recolher todas" : "Expandir todas"}
        </button>
        {dados.podeEditar && (
          <button onClick={() => setEditarEquipe("nova")} className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            + Nova equipe
          </button>
        )}
      </div>

      <div className="space-y-3">
        {equipesVisiveis.map((e) => {
          const vagas = vagasPorEquipe.get(e.id) ?? [];
          const preenchidas = vagas.filter(temNome).length;
          const aberta = abertas.has(e.id) || !!t;
          return (
            <section key={e.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <button
                  onClick={() => setAbertas((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={aberta}
                >
                  <span className="text-gray-400">{aberta ? "▾" : "▸"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {e.codigo} · {e.nome}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      <span className={e.projeto === A_DEFINIR ? "font-medium text-amber-700" : ""}>{e.projeto === A_DEFINIR ? "contrato a definir" : e.projeto}</span> · {e.grupo}
                      {e.gestor ? ` · gestor ${e.gestor}` : ""}
                    </span>
                  </span>
                </button>
                <span className="text-xs tabular-nums text-gray-500">
                  {preenchidas}/{vagas.length} preenchidas
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.status === "Ativa" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{e.status}</span>
                {dados.podeEditar && (
                  <>
                    <button onClick={() => setEditarEquipe(e)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">Editar equipe</button>
                    <button onClick={() => setNovaVagaEm(e)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">+ Vaga</button>
                  </>
                )}
              </div>
              {aberta && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Cargo / função</th>
                        <th className="px-3 py-1.5 text-left">Empresa</th>
                        <th className="px-3 py-1.5 text-left">Atividade</th>
                        <th className="px-3 py-1.5 text-left">Profissional</th>
                        <th className="px-3 py-1.5 text-left">Status</th>
                        <th className="px-3 py-1.5 text-center" title="Habilitado a dirigir 4x4">4x4</th>
                        <th className="px-3 py-1.5 text-left">Hoje</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {vagas.map((v) => {
                        const est = estadoDaVaga(v, idx, hoje);
                        const ausencias = dados.ausencias.filter((a) => a.vagaId === v.id).length;
                        return (
                          <tr key={v.id} className="align-top hover:bg-gray-50/60">
                            <td className="px-3 py-1.5 text-gray-800">
                              {v.cargo}
                              {v.nivel && v.nivel !== "NA" && <span className="ml-1.5 text-[11px] text-gray-400">{v.nivel}</span>}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600">{v.empresa}</td>
                            <td className="px-3 py-1.5 text-gray-600">{v.atividade}</td>
                            <td className="px-3 py-1.5">
                              {dados.podeEditar && !ocultarNomes ? (
                                <input
                                  key={`${v.id}-${v.nome ?? ""}`}
                                  defaultValue={v.nome ?? ""}
                                  placeholder="vaga aberta"
                                  onBlur={(ev) => {
                                    const novo = ev.target.value.trim();
                                    if (novo !== (v.nome ?? "")) alterarVaga(v, { nome: novo || null });
                                  }}
                                  onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                                  className="w-full min-w-[160px] rounded-md border border-transparent px-1.5 py-0.5 text-sm text-ink hover:border-gray-200 focus:border-brand focus:outline-none"
                                />
                              ) : (
                                <span className={temNome(v) ? "text-ink" : "text-gray-300"}>{ocultarNomes ? "—" : v.nome ?? "vaga aberta"}</span>
                              )}
                              {v.contratoAtual && v.disponivelAPartir && v.disponivelAPartir > hoje && (
                                <div className="text-[11px] text-sky-700">em {v.contratoAtual} até {fmtDia(v.disponivelAPartir)}</div>
                              )}
                              {v.destino && <div className="text-[11px] text-gray-400">vai para: {v.destino}</div>}
                            </td>
                            <td className="px-3 py-1.5">
                              {dados.podeEditar ? (
                                <select value={v.status} onChange={(ev) => alterarVaga(v, { status: ev.target.value })} className="rounded-md border border-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
                                  {(STATUS_VAGA as readonly string[]).includes(v.status) ? null : <option>{v.status}</option>}
                                  {STATUS_VAGA.map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-600">{v.status}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center text-xs text-gray-500">{v.direcao4x4 === true ? "Sim" : v.direcao4x4 === false ? "Não" : "—"}</td>
                            <td className="px-3 py-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_SITUACAO[est.situacao]}`}>{ROTULO_SITUACAO[est.situacao]}</span>
                              {est.situacao === "AUSENTE" && est.motivo && <div className="text-[11px] text-gray-400">{est.motivo}</div>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-right">
                              <button onClick={() => setAusenciasDe(v)} className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50">
                                Ausências{ausencias > 0 ? ` (${ausencias})` : ""}
                              </button>
                              {dados.podeEditar && (
                                <button onClick={() => setDetalhes(v)} className="ml-1 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50">
                                  Detalhes
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
        {equipesVisiveis.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400">
            {dados.equipes.length === 0 ? "Nenhuma equipe cadastrada ainda. Importe a planilha do Samuel acima." : "Nenhuma equipe neste filtro."}
          </div>
        )}
      </div>

      {editarEquipe && (
        <EquipeModal
          equipe={editarEquipe === "nova" ? null : editarEquipe}
          projetos={projetos}
          grupos={grupos}
          onFechar={() => setEditarEquipe(null)}
          onSalvo={async () => {
            setEditarEquipe(null);
            await recarregar();
          }}
        />
      )}
      {novaVagaEm && (
        <NovaVagaModal
          equipe={novaVagaEm}
          onFechar={() => setNovaVagaEm(null)}
          onSalvo={async () => {
            setNovaVagaEm(null);
            await recarregar();
          }}
        />
      )}
      {detalhes && (
        <DetalhesVagaModal
          vaga={detalhes}
          equipes={dados.equipes}
          projetos={projetos}
          onFechar={() => setDetalhes(null)}
          onSalvo={async () => {
            setDetalhes(null);
            await recarregar();
          }}
        />
      )}
      {ausenciasDe && <AusenciasModal vaga={ausenciasDe} dados={dados} nome={nomeDe(ausenciasDe)} onFechar={() => setAusenciasDe(null)} recarregar={recarregar} />}
    </div>
  );
}

// ---------------------------------------------------------------- importar planilha

function ImportarPlanilha({ recarregar, temEquipes }: { recarregar: () => Promise<void>; temEquipes: boolean }) {
  const [aberto, setAberto] = useState(!temEquipes);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [dataRef, setDataRef] = useState(hojeBr());
  const [acrescentar, setAcrescentar] = useState(false);
  const [resumo, setResumo] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(simular: boolean, forcarAcrescentar = acrescentar) {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) return setErro("Escolha a planilha (.xlsx) primeiro.");
    setOcupado(true);
    setErro(null);
    setOk(null);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("dataReferencia", dataRef);
    const q = [simular ? "simular=1" : "", forcarAcrescentar ? "acrescentar=1" : ""].filter(Boolean).join("&");
    const r = await chamar("POST", `/api/efetivos/importar${q ? `?${q}` : ""}`, fd);
    setOcupado(false);
    if (!r.ok) {
      setResumo(null);
      if ((r.dados as any).jaTemDados) setAcrescentar(false);
      return setErro(r.dados.error ?? "Não foi possível importar");
    }
    if (simular) return setResumo(r.dados);
    setResumo(null);
    setOk(`Importado: ${(r.dados as any).equipesNovas} equipes, ${(r.dados as any).vagasNovas} vagas e ${(r.dados as any).veiculosNovos} viaturas.`);
    if (arquivoRef.current) arquivoRef.current.value = "";
    setNomeArquivo("");
    await recarregar();
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-ink">Importar planilha do Samuel</span>
        <span className="text-gray-400">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            Use a planilha mais recente (aba “DIVISÃO DE EQUIPES”, com a aba de apoio de outro contrato). É a <strong>carga inicial</strong>: depois dela, a atualização é feita aqui no sistema e a importação nunca sobrescreve o que já foi ajustado.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-500">
              Planilha
              <input
                ref={arquivoRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setNomeArquivo(f?.name ?? "");
                  setResumo(null);
                  const d = f ? dataDoNomeDoArquivo(f.name) : null;
                  if (d) setDataRef(d);
                }}
                className="mt-1 block text-sm"
              />
            </label>
            <label className="text-xs text-gray-500">
              Data da planilha
              <input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
            </label>
            <button onClick={() => enviar(true)} disabled={ocupado || !nomeArquivo} className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-light disabled:opacity-50">
              {ocupado ? "Lendo…" : "Conferir antes de importar"}
            </button>
          </div>
          {temEquipes && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={acrescentar} onChange={(e) => { setAcrescentar(e.target.checked); setResumo(null); }} />
              Acrescentar só equipes novas (já existem equipes no sistema; as de mesmo nome são mantidas como estão)
            </label>
          )}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {ok && <Aviso tipo="ok">{ok}</Aviso>}
          {resumo && (
            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
              <div className="font-medium text-ink">O que vai entrar (nada foi gravado ainda):</div>
              <ul className="grid gap-x-6 gap-y-0.5 text-xs text-gray-700 sm:grid-cols-2">
                <li>Equipes novas: <strong>{resumo.equipesNovas}</strong> (de {resumo.equipesNaPlanilha} na planilha)</li>
                <li>Vagas: <strong>{resumo.vagasNovas}</strong> — {resumo.vagasPreenchidas} com profissional, {resumo.vagasAbertas} abertas</li>
                <li>Viaturas citadas: <strong>{resumo.veiculosNovos}</strong></li>
                <li>Apoio de outro contrato: <strong>{resumo.apoioDeOutroContrato}</strong> pessoas</li>
              </ul>
              {resumo.avisos?.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                  {resumo.avisos.map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
              <button onClick={() => enviar(false)} disabled={ocupado || resumo.equipesNovas === 0} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
                {ocupado ? "Importando…" : "Importar agora"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- modais

function EquipeModal({ equipe, projetos, grupos, onFechar, onSalvo }: { equipe: Equipe | null; projetos: string[]; grupos: string[]; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [v, setV] = useState({ nome: equipe?.nome ?? "", projeto: equipe?.projeto ?? "", gestor: equipe?.gestor ?? "", grupo: equipe?.grupo ?? "Fauna", status: equipe?.status ?? "Ativa" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const corpo = { nome: v.nome, projeto: v.projeto, gestor: v.gestor || null, grupo: v.grupo, status: v.status };
    const r = await chamar(equipe ? "PATCH" : "POST", equipe ? `/api/efetivos/equipes/${equipe.id}` : "/api/efetivos/equipes", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await onSalvo();
  }
  return (
    <Modal titulo={equipe ? `Editar ${equipe.codigo}` : "Nova equipe"} onFechar={onFechar}>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="text-xs text-gray-500 sm:col-span-2">
          Nome da equipe / frente
          <input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Contrato / projeto (CT)
          <input list="projetos-equipe" value={v.projeto === A_DEFINIR ? "" : v.projeto} onChange={(e) => setV({ ...v, projeto: e.target.value })} placeholder="ex.: 3636 PNM" className={campo} />
          <datalist id="projetos-equipe">
            {projetos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-gray-500">
          Gestor MRN
          <input value={v.gestor} onChange={(e) => setV({ ...v, gestor: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Grupo
          <input list="grupos-equipe" value={v.grupo} onChange={(e) => setV({ ...v, grupo: e.target.value })} className={campo} />
          <datalist id="grupos-equipe">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-gray-500">
          Situação da equipe
          <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className={campo}>
            {STATUS_EQUIPE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {erro && <div className="mx-5 mb-3"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !v.nome.trim() || !v.projeto.trim() || !v.grupo.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}

function NovaVagaModal({ equipe, onFechar, onSalvo }: { equipe: Equipe; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [v, setV] = useState({ cargo: "", empresa: "Consominas", atividade: "Resgate", nivel: "", nome: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", "/api/efetivos/vagas", { equipeId: equipe.id, cargo: v.cargo, empresa: v.empresa, atividade: v.atividade, nivel: v.nivel || null, nome: v.nome || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await onSalvo();
  }
  return (
    <Modal titulo={`Nova vaga — ${equipe.codigo}`} onFechar={onFechar}>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="text-xs text-gray-500 sm:col-span-2">
          Cargo / função
          <input value={v.cargo} onChange={(e) => setV({ ...v, cargo: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Empresa
          <input value={v.empresa} onChange={(e) => setV({ ...v, empresa: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Atividade
          <input value={v.atividade} onChange={(e) => setV({ ...v, atividade: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Nível
          <select value={v.nivel} onChange={(e) => setV({ ...v, nivel: e.target.value })} className={campo}>
            <option value="">—</option>
            <option>Superior</option>
            <option>Técnico</option>
            <option>NA</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Profissional (deixe em branco se a vaga está aberta)
          <input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} className={campo} />
        </label>
      </div>
      {erro && <div className="mx-5 mb-3"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !v.cargo.trim() || !v.empresa.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {salvando ? "Salvando…" : "Criar vaga"}
        </button>
      </div>
    </Modal>
  );
}

function DetalhesVagaModal({ vaga, equipes, projetos, onFechar, onSalvo }: { vaga: Vaga; equipes: Equipe[]; projetos: string[]; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [v, setV] = useState({
    equipeId: vaga.equipeId,
    cargo: vaga.cargo,
    empresa: vaga.empresa,
    atividade: vaga.atividade,
    nivel: vaga.nivel ?? "",
    direcao4x4: vaga.direcao4x4 === true ? "sim" : vaga.direcao4x4 === false ? "nao" : "",
    contratoAtual: vaga.contratoAtual ?? "",
    disponivelAPartir: vaga.disponivelAPartir ?? "",
    destino: vaga.destino ?? "",
    previsaoInicio: vaga.previsaoInicio ?? "",
    observacao: vaga.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("PATCH", `/api/efetivos/vagas/${vaga.id}`, {
      equipeId: v.equipeId,
      cargo: v.cargo,
      empresa: v.empresa,
      atividade: v.atividade,
      nivel: v.nivel || null,
      direcao4x4: v.direcao4x4 === "sim" ? true : v.direcao4x4 === "nao" ? false : null,
      contratoAtual: v.contratoAtual || null,
      disponivelAPartir: v.disponivelAPartir || null,
      destino: v.destino || null,
      previsaoInicio: v.previsaoInicio || null,
      observacao: v.observacao || null,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await onSalvo();
  }
  return (
    <Modal titulo={`Detalhes da vaga — ${vaga.cargo}`} onFechar={onFechar}>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="text-xs text-gray-500 sm:col-span-2">
          Equipe (mudar aqui move a pessoa de equipe)
          <select value={v.equipeId} onChange={(e) => setV({ ...v, equipeId: e.target.value })} className={campo}>
            {equipes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} · {e.nome} ({e.projeto})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Cargo / função
          <input value={v.cargo} onChange={(e) => setV({ ...v, cargo: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Empresa
          <input value={v.empresa} onChange={(e) => setV({ ...v, empresa: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Atividade
          <input value={v.atividade} onChange={(e) => setV({ ...v, atividade: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Nível
          <select value={v.nivel} onChange={(e) => setV({ ...v, nivel: e.target.value })} className={campo}>
            <option value="">—</option>
            <option>Superior</option>
            <option>Técnico</option>
            <option>NA</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Dirige 4x4?
          <select value={v.direcao4x4} onChange={(e) => setV({ ...v, direcao4x4: e.target.value })} className={campo}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Previsão de início (vaga em contratação)
          <input type="date" value={v.previsaoInicio} onChange={(e) => setV({ ...v, previsaoInicio: e.target.value })} className={campo} />
        </label>
        <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 sm:col-span-2">
          <div className="mb-2 text-xs font-semibold text-sky-900">Ainda em outro contrato? (reforço que vai migrar)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-gray-500">
              Contrato atual
              <input list="projetos-vaga" value={v.contratoAtual} onChange={(e) => setV({ ...v, contratoAtual: e.target.value })} className={campo} />
              <datalist id="projetos-vaga">
                {projetos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="text-xs text-gray-500">
              Livre a partir de
              <input type="date" value={v.disponivelAPartir} onChange={(e) => setV({ ...v, disponivelAPartir: e.target.value })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Vai migrar para
              <input value={v.destino} onChange={(e) => setV({ ...v, destino: e.target.value })} className={campo} />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">Antes da data de liberação a pessoa conta como ocupada nesse contrato e não aparece livre para montar equipe.</p>
        </div>
        <label className="text-xs text-gray-500 sm:col-span-2">
          Observação (só quem edita vê)
          <textarea value={v.observacao} onChange={(e) => setV({ ...v, observacao: e.target.value })} rows={2} className={campo} />
        </label>
      </div>
      {erro && <div className="mx-5 mb-3"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !v.cargo.trim() || !v.empresa.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}

function AusenciasModal({ vaga, dados, nome, onFechar, recarregar }: { vaga: Vaga; dados: DadosTela; nome: string; onFechar: () => void; recarregar: () => Promise<void> }) {
  const lista = dados.ausencias.filter((a) => a.vagaId === vaga.id).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const [f, setF] = useState({ tipo: "Férias", inicio: hojeBr(), fim: hojeBr(), observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function adicionar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const r = await chamar("POST", "/api/efetivos/ausencias", { vagaId: vaga.id, tipo: f.tipo, inicio: f.inicio, fim: f.fim, observacao: f.observacao || null });
    setOcupado(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível lançar");
    const conflitos = (r.dados as any).conflitos as string[] | undefined;
    if (conflitos?.length) setAviso(`Atenção: ${nome} está escalado(a) em ${conflitos.join(", ")} nesse período. Ajuste a equipe da campanha.`);
    await recarregar();
  }
  async function remover(id: string) {
    setOcupado(true);
    const r = await chamar("DELETE", `/api/efetivos/ausencias/${id}`);
    setOcupado(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível remover");
    await recarregar();
  }

  return (
    <Modal titulo={`Ausências — ${nome}`} onFechar={onFechar}>
      <div className="space-y-3 px-5 py-4">
        {lista.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma ausência lançada.</p>
        ) : (
          <ul className="divide-y divide-gray-50 text-sm">
            {lista.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  <span className="font-medium text-ink">{a.tipo}</span> · {fmtDia(a.inicio)} a {fmtDia(a.fim)}
                  {a.observacao && <span className="block text-[11px] text-gray-400">{a.observacao}</span>}
                </span>
                {dados.podeEditar && (
                  <button onClick={() => remover(a.id)} disabled={ocupado} className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">
                    remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {dados.podeEditar && (
          <div className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-4">
            <label className="text-xs text-gray-500">
              Tipo
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={campo}>
                {TIPOS_AUSENCIA.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Início
              <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Fim
              <input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} className={campo} />
            </label>
            <label className="flex items-end">
              <button onClick={adicionar} disabled={ocupado || !f.inicio || !f.fim} className="w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
                Lançar
              </button>
            </label>
          </div>
        )}
        {aviso && <Aviso tipo="atencao">{aviso}</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!dados.podeEditar && <p className="text-[11px] text-gray-400">O motivo da ausência é restrito a quem monta as equipes.</p>}
      </div>
    </Modal>
  );
}
