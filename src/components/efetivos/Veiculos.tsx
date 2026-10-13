"use client";

import { useMemo, useState } from "react";
import { STATUS_VEICULO, diasNoLocal, localizacaoNoDia, proximoMovimento, resumoPorContrato, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { chamar, fmtDia, hojeBr, type DadosTela, type Veiculo } from "./comum";
import { Aviso, Modal, campo } from "./ui";

const COR_STATUS: Record<string, string> = {
  "Em operação": "bg-emerald-100 text-emerald-800",
  Disponível: "bg-sky-100 text-sky-800",
  "Em manutenção": "bg-amber-100 text-amber-800",
  Parado: "bg-red-100 text-red-700",
  Devolvido: "bg-gray-100 text-gray-500",
};
const A_DEFINIR = "A definir";

type Props = { dados: DadosTela; recarregar: () => Promise<void> };

export default function Veiculos({ dados, recarregar }: Props) {
  const hoje = hojeBr();
  const [dia, setDia] = useState(hoje);
  const [filtroContrato, setFiltroContrato] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [mover, setMover] = useState<Veiculo | null>(null);
  const [historico, setHistorico] = useState<Veiculo | null>(null);
  const [editar, setEditar] = useState<Veiculo | "novo" | null>(null);

  const equipePorId = useMemo(() => new Map(dados.equipes.map((e) => [e.id, e])), [dados.equipes]);
  const campanhaPorId = useMemo(() => new Map(dados.campanhas.map((c) => [c.id, c])), [dados.campanhas]);
  const movimentosPorVeiculo = useMemo(() => {
    const m = new Map<string, MovimentoBase[]>();
    for (const x of dados.movimentos) {
      if (!m.has(x.veiculoId)) m.set(x.veiculoId, []);
      m.get(x.veiculoId)!.push(x);
    }
    return m;
  }, [dados.movimentos]);

  const resumo = useMemo(() => resumoPorContrato(dados.veiculos, dados.movimentos, dia), [dados.veiculos, dados.movimentos, dia]);
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.veiculos
      .map((v) => {
        const movs = movimentosPorVeiculo.get(v.id) ?? [];
        return { v, loc: localizacaoNoDia(movs, dia), prox: proximoMovimento(movs, dia) };
      })
      .filter(({ v, loc }) => (!filtroContrato || (loc?.projeto ?? "Sem localização") === filtroContrato) && (!filtroStatus || v.status === filtroStatus))
      .filter(({ v, loc }) => !t || `${v.codigo} ${v.identificacao} ${v.placa ?? ""} ${v.modelo ?? ""} ${loc?.projeto ?? ""} ${loc?.local ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => (a.loc?.projeto ?? "~").localeCompare(b.loc?.projeto ?? "~") || a.v.identificacao.localeCompare(b.v.identificacao, "pt-BR", { numeric: true }));
  }, [dados.veiculos, movimentosPorVeiculo, dia, filtroContrato, filtroStatus, busca]);

  const porStatus = (s: string) => dados.veiculos.filter((v) => v.status === s).length;
  const semLocalizacao = resumo.find((r) => r.projeto === "Sem localização")?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <label className="text-xs text-gray-500">
          Posição em
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <button onClick={() => setDia(hoje)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Hoje</button>
        <label className="text-xs text-gray-500">
          Contrato
          <select value={filtroContrato} onChange={(e) => setFiltroContrato(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value="">Todos</option>
            {resumo.map((r) => (
              <option key={r.projeto} value={r.projeto}>
                {r.projeto} ({r.total})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Situação
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value="">Todas</option>
            {STATUS_VEICULO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Buscar
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="placa, VL, local…" className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        {dados.podeEditar && (
          <button onClick={() => setEditar("novo")} className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            + Novo veículo
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Veículos", dados.veiculos.length, "text-ink"],
          ["Em operação", porStatus("Em operação"), "text-emerald-600"],
          ["Disponíveis", porStatus("Disponível"), "text-sky-600"],
          ["Manutenção / parados", porStatus("Em manutenção") + porStatus("Parado"), "text-amber-600"],
          ["Sem localização", semLocalizacao, semLocalizacao > 0 ? "text-red-600" : "text-gray-400"],
        ].map(([r, v, c]) => (
          <div key={r as string} className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{r}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <h2 className="border-b border-gray-100 bg-brand px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">Veículos por contrato em {fmtDia(dia)}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Contrato / projeto</th>
                <th className="px-3 py-2 text-right">Total</th>
                {STATUS_VEICULO.map((s) => (
                  <th key={s} className="px-3 py-2 text-right">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resumo.map((r) => (
                <tr key={r.projeto} onClick={() => setFiltroContrato(filtroContrato === r.projeto ? "" : r.projeto)} className={`cursor-pointer hover:bg-gray-50/60 ${filtroContrato === r.projeto ? "bg-brand-light/60" : ""}`}>
                  <td className={`px-3 py-1.5 font-medium ${r.projeto === A_DEFINIR || r.projeto === "Sem localização" ? "text-amber-700" : "text-ink"}`}>{r.projeto === A_DEFINIR ? "Contrato a definir" : r.projeto}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.total}</td>
                  {STATUS_VEICULO.map((s) => (
                    <td key={s} className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.porStatus[s] ?? <span className="text-gray-200">0</span>}</td>
                  ))}
                </tr>
              ))}
              {resumo.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">Nenhum veículo cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Veículo</th>
              <th className="px-3 py-2 text-left">Placa / modelo</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-left">Onde está</th>
              <th className="px-3 py-2 text-left">Desde</th>
              <th className="px-3 py-2 text-left">Próxima mudança</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map(({ v, loc, prox }) => {
              const eq = loc?.equipeId ? equipePorId.get(loc.equipeId) : null;
              const camp = loc?.campanhaId ? campanhaPorId.get(loc.campanhaId) : null;
              const proxEq = prox?.equipeId ? equipePorId.get(prox.equipeId) : null;
              return (
                <tr key={v.id} className="align-top hover:bg-gray-50/60">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{v.identificacao}</div>
                    <div className="text-[11px] text-gray-400">
                      {v.codigo}
                      {v.tracao4x4 ? " · 4x4" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {v.placa ?? <span className="text-amber-600">placa a informar</span>}
                    {v.modelo && <div className="text-[11px] text-gray-400">{v.modelo}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_STATUS[v.status]}`}>{v.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {loc ? (
                      <>
                        <div className={`font-medium ${loc.projeto === A_DEFINIR ? "text-amber-700" : "text-ink"}`}>{loc.projeto === A_DEFINIR ? "Contrato a definir" : loc.projeto}</div>
                        <div className="text-[11px] text-gray-500">
                          {[eq ? `${eq.codigo} · ${eq.nome}` : null, camp ? camp.codigo : null, loc.local].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </>
                    ) : (
                      <span className="text-red-600">sem localização registrada</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {loc ? (
                      <>
                        {fmtDia(loc.inicio)}
                        <div className="text-[11px] text-gray-400">{diasNoLocal(loc, dia)} dia(s)</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {prox ? (
                      <>
                        {fmtDia(prox.inicio)} → <span className="font-medium text-ink">{prox.projeto}</span>
                        <div className="text-[11px] text-gray-400">{proxEq?.nome ?? ""}</div>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button onClick={() => setHistorico(v)} className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50">Histórico</button>
                    {dados.podeEditar && (
                      <>
                        <button onClick={() => setMover(v)} className="ml-1 rounded-md bg-brand px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-dark">Mover</button>
                        <button onClick={() => setEditar(v)} className="ml-1 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50">Editar</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                  {dados.veiculos.length === 0 ? "Nenhum veículo cadastrado ainda. Importe a planilha (aba Efetivos) ou use “Novo veículo”." : "Nenhum veículo neste filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mover && <MoverModal veiculo={mover} dados={dados} onFechar={() => setMover(null)} onSalvo={async () => { setMover(null); await recarregar(); }} />}
      {historico && <HistoricoModal veiculo={historico} dados={dados} onFechar={() => setHistorico(null)} recarregar={recarregar} />}
      {editar && <VeiculoModal veiculo={editar === "novo" ? null : editar} dados={dados} onFechar={() => setEditar(null)} onSalvo={async () => { setEditar(null); await recarregar(); }} />}
    </div>
  );
}

function contratosConhecidos(dados: DadosTela): string[] {
  return Array.from(new Set([...dados.equipes.map((e) => e.projeto), ...dados.movimentos.map((m) => m.projeto), ...dados.campanhas.map((c) => c.projeto)].filter((p) => p && p !== A_DEFINIR))).sort();
}

function MoverModal({ veiculo, dados, onFechar, onSalvo }: { veiculo: Veiculo; dados: DadosTela; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const atual = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === veiculo.id), hojeBr());
  const [f, setF] = useState({ inicio: hojeBr(), fim: "", projeto: "", equipeId: "", campanhaId: "", local: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function escolherEquipe(id: string) {
    const eq = dados.equipes.find((e) => e.id === id);
    // ao escolher a equipe, sugere o contrato dela (se ja definido) sem travar a edicao
    setF((x) => ({ ...x, equipeId: id, projeto: x.projeto || (eq && eq.projeto !== A_DEFINIR ? eq.projeto : "") }));
  }
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", `/api/efetivos/veiculos/${veiculo.id}/mover`, {
      inicio: f.inicio,
      fim: f.fim || null,
      projeto: f.projeto,
      equipeId: f.equipeId || null,
      campanhaId: f.campanhaId || null,
      local: f.local || null,
      observacao: f.observacao || null,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível mover");
    await onSalvo();
  }
  return (
    <Modal titulo={`Mover ${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`} onFechar={onFechar}>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs text-gray-500">
          Hoje: <strong className="text-ink">{atual ? `${atual.projeto}${atual.local ? ` — ${atual.local}` : ""}` : "sem localização registrada"}</strong>. A passagem atual é encerrada no dia anterior ao início da nova; o histórico fica guardado.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-500">
            A partir de
            <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={campo} />
          </label>
          <label className="text-xs text-gray-500">
            Até (opcional — vazio = continua lá)
            <input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} className={campo} />
          </label>
          <label className="text-xs text-gray-500">
            Contrato / projeto
            <input list="contratos-veiculo" value={f.projeto} onChange={(e) => setF({ ...f, projeto: e.target.value })} className={campo} />
            <datalist id="contratos-veiculo">
              {contratosConhecidos(dados).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-gray-500">
            Equipe (opcional)
            <select value={f.equipeId} onChange={(e) => escolherEquipe(e.target.value)} className={campo}>
              <option value="">—</option>
              {dados.equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            Campanha (opcional)
            <select value={f.campanhaId} onChange={(e) => setF({ ...f, campanhaId: e.target.value })} className={campo}>
              <option value="">—</option>
              {dados.campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.projeto}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            Local / frente
            <input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} className={campo} />
          </label>
          <label className="text-xs text-gray-500 sm:col-span-2">
            Observação
            <input value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} className={campo} />
          </label>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !f.projeto.trim() || !f.inicio} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {salvando ? "Gravando…" : "Registrar movimentação"}
        </button>
      </div>
    </Modal>
  );
}

function HistoricoModal({ veiculo, dados, onFechar, recarregar }: { veiculo: Veiculo; dados: DadosTela; onFechar: () => void; recarregar: () => Promise<void> }) {
  const movs = dados.movimentos.filter((m) => m.veiculoId === veiculo.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const [erro, setErro] = useState<string | null>(null);
  async function remover(id: string) {
    if (!window.confirm("Remover esta passagem do histórico? (use só para corrigir um lançamento errado)")) return;
    const r = await chamar("DELETE", `/api/efetivos/veiculos/${veiculo.id}/movimentos/${id}`);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível remover");
    await recarregar();
  }
  return (
    <Modal titulo={`Histórico — ${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`} onFechar={onFechar}>
      <div className="space-y-2 px-5 py-4">
        {movs.length === 0 && <p className="text-sm text-gray-400">Nenhuma localização registrada para este veículo.</p>}
        <ol className="space-y-2">
          {movs.map((m) => {
            const eq = m.equipeId ? dados.equipes.find((e) => e.id === m.equipeId) : null;
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-ink">{m.projeto === A_DEFINIR ? "Contrato a definir" : m.projeto}</span>
                  <span className="block text-xs text-gray-500">
                    {fmtDia(m.inicio)} a {m.fim ? fmtDia(m.fim) : "hoje (continua)"}
                    {eq ? ` · ${eq.codigo} ${eq.nome}` : ""}
                    {m.local ? ` · ${m.local}` : ""}
                  </span>
                  {m.observacao && <span className="block text-[11px] text-gray-400">{m.observacao}</span>}
                </span>
                {dados.podeEditar && (
                  <button onClick={() => remover(m.id)} className="shrink-0 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50">remover</button>
                )}
              </li>
            );
          })}
        </ol>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

function VeiculoModal({ veiculo, dados, onFechar, onSalvo }: { veiculo: Veiculo | null; dados: DadosTela; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [f, setF] = useState({
    identificacao: veiculo?.identificacao ?? "",
    placa: veiculo?.placa ?? "",
    modelo: veiculo?.modelo ?? "",
    tracao4x4: veiculo?.tracao4x4 === true ? "sim" : veiculo?.tracao4x4 === false ? "nao" : "",
    status: veiculo?.status ?? "Em operação",
    observacao: veiculo?.observacao ?? "",
    projeto: "",
    equipeId: "",
    local: "",
    inicio: hojeBr(),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const base = {
      identificacao: f.identificacao,
      placa: f.placa || null,
      modelo: f.modelo || null,
      tracao4x4: f.tracao4x4 === "sim" ? true : f.tracao4x4 === "nao" ? false : null,
      status: f.status,
      observacao: f.observacao || null,
    };
    const corpo = veiculo ? base : { ...base, ...(f.projeto ? { localizacao: { inicio: f.inicio, projeto: f.projeto, equipeId: f.equipeId || null, local: f.local || null } } : {}) };
    const r = await chamar(veiculo ? "PATCH" : "POST", veiculo ? `/api/efetivos/veiculos/${veiculo.id}` : "/api/efetivos/veiculos", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await onSalvo();
  }
  return (
    <Modal titulo={veiculo ? `Editar ${veiculo.identificacao}` : "Novo veículo"} onFechar={onFechar}>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="text-xs text-gray-500">
          Identificação (como a equipe chama)
          <input value={f.identificacao} onChange={(e) => setF({ ...f, identificacao: e.target.value })} placeholder="ex.: VL 01" className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Placa
          <input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Modelo
          <input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-gray-500">
          Tração 4x4?
          <select value={f.tracao4x4} onChange={(e) => setF({ ...f, tracao4x4: e.target.value })} className={campo}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Situação
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={campo}>
            {STATUS_VEICULO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Observação
          <input value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} className={campo} />
        </label>
        {!veiculo && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 sm:col-span-2">
            <div className="mb-2 text-xs font-semibold text-gray-700">Onde está agora (opcional)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-gray-500">
                Contrato / projeto
                <input list="contratos-novo" value={f.projeto} onChange={(e) => setF({ ...f, projeto: e.target.value })} className={campo} />
                <datalist id="contratos-novo">
                  {contratosConhecidos(dados).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="text-xs text-gray-500">
                Desde
                <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={campo} />
              </label>
              <label className="text-xs text-gray-500">
                Equipe
                <select value={f.equipeId} onChange={(e) => setF({ ...f, equipeId: e.target.value })} className={campo}>
                  <option value="">—</option>
                  {dados.equipes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.codigo} · {e.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Local / frente
                <input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} className={campo} />
              </label>
            </div>
          </div>
        )}
      </div>
      {erro && <div className="mx-5 mb-3"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !f.identificacao.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
