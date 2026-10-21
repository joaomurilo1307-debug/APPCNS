"use client";

import { useEffect, useState } from "react";

// Painel da geracao automatica de dossies (lib/dossie/automatico.ts): mostra se o sistema esta conferindo sozinho,
// quantas OCs precisam de dossie, quantas estao em dia e o que falta (com o motivo). "Verificar agora" dispara um ciclo.

type Item = { numOcp: string; codFil: string; fornecedorNome: string | null; vencimento: string | null; situacao: string; acao: string; motivo: string };
type Ciclo = {
  iniciadoEm: string;
  terminouEm: string;
  origem: string;
  elegiveis: number;
  atuais: number;
  semDossie: number;
  desatualizados: number;
  comErro: number;
  gerando: number;
  geradosAgora: number;
  falhasAgora: number;
  interrompidoPor: string | null;
  pendentes: Item[];
};
type Estado = {
  ativo: boolean;
  emCurso: boolean;
  ultimo: Ciclo | null;
  ultimoErro: { em: string; mensagem: string } | null;
  politica?: { diasAtras: number; diasFrente: number; diasAtrasPagas: number; lote: number; janela: string; intervaloMin: number };
};

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const ROTULO: Record<string, string> = { SEM_DOSSIE: "sem dossiê", DESATUALIZADO: "desatualizado", ERRO: "com erro", GERANDO: "gerando" };
const COR: Record<string, string> = { SEM_DOSSIE: "text-amber-700", DESATUALIZADO: "text-sky-700", ERRO: "text-red-700", GERANDO: "text-gray-500" };

export default function DossiesAutomaticos() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [pedindo, setPedindo] = useState(false);

  async function carregar() {
    try {
      const r = await fetch("/api/dossies/automatico", { cache: "no-store" });
      if (r.ok) setEstado(await r.json());
    } catch {
      /* sem rede: mantem o que ja' tinha */
    }
  }

  useEffect(() => {
    void carregar();
  }, []);
  // enquanto um ciclo roda, reconsulta a cada 6 s
  const emCurso = estado?.emCurso ?? false;
  useEffect(() => {
    if (!emCurso) return;
    const t = setInterval(carregar, 6000);
    return () => clearInterval(t);
  }, [emCurso]);

  async function verificarAgora() {
    setPedindo(true);
    try {
      const r = await fetch("/api/dossies/automatico", { method: "POST" });
      if (r.ok) setEstado(await r.json());
    } finally {
      setPedindo(false);
    }
  }

  if (!estado) return null;
  const u = estado.ultimo;
  const falta = u ? u.semDossie + u.desatualizados + u.comErro + u.gerando : 0; // total; a lista traz so' os primeiros
  const tom = !estado.ativo || (!u && !estado.ultimoErro) ? "border-gray-200 bg-gray-50" : u?.interrompidoPor || estado.ultimoErro ? "border-red-200 bg-red-50" : falta > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50";

  return (
    <div className={`mb-4 rounded-xl border p-3.5 text-sm shadow-sm ${tom}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-gray-800">Dossiês automáticos</span>
        {!estado.ativo ? (
          <span className="text-gray-600">desligado neste servidor (DOSSIE_AUTO=0)</span>
        ) : !u ? (
          <span className="text-gray-600">{estado.emCurso ? "primeira verificação em andamento…" : "aguardando a primeira verificação (começa poucos minutos depois de o servidor subir)"}</span>
        ) : (
          <>
            <span className="text-gray-700">
              <b>{u.atuais}</b> de <b>{u.elegiveis}</b> OCs com dossiê em dia
            </span>
            {u.semDossie > 0 && <span className="text-amber-700">{u.semDossie} sem dossiê</span>}
            {u.desatualizados > 0 && <span className="text-sky-700">{u.desatualizados} desatualizado(s)</span>}
            {u.comErro > 0 && <span className="text-red-700">{u.comErro} com erro</span>}
            {u.gerando > 0 && <span className="text-gray-600">{u.gerando} gerando</span>}
            <span className="text-xs text-gray-500">
              verificado em {hora(u.terminouEm)}
              {u.geradosAgora > 0 ? ` · ${u.geradosAgora} gerado(s) nesta verificação` : ""}
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          {falta > 0 && (
            <button onClick={() => setAberto((a) => !a)} className="text-xs text-gray-600 underline decoration-dotted underline-offset-2">
              {aberto ? "esconder a lista" : `ver o que falta (${falta})`}
            </button>
          )}
          <button
            onClick={verificarAgora}
            disabled={pedindo || estado.emCurso}
            title="Confere agora, na Senior, quais OCs precisam de dossiê e gera as que faltam (o sistema também faz isso sozinho a cada 5 minutos, de segunda a sábado, das 6h às 22h)"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-50"
          >
            {estado.emCurso ? "Verificando…" : "Verificar agora"}
          </button>
        </span>
      </div>
      {(u?.interrompidoPor || estado.ultimoErro) && (
        <p className="mt-1.5 text-xs text-red-700">{u?.interrompidoPor ?? `A última verificação falhou: ${estado.ultimoErro!.mensagem}`}</p>
      )}
      {estado.politica && estado.ativo && (
        <p className="mt-1 text-[11px] text-gray-500">
          Gera para toda OC aprovada com vencimento de {estado.politica.diasAtras} dias atrás a {estado.politica.diasFrente} dias à frente, para as que têm título em aberto e
          para as já pagas dos últimos {estado.politica.diasAtrasPagas} dias; refaz o PDF quando a OC muda (título novo ou pago, nota, valor). Falhou? Tenta de novo sozinho,
          com intervalo crescente.
        </p>
      )}
      {aberto && u && u.pendentes.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          {falta > u.pendentes.length && (
            <p className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
              Mostrando as {u.pendentes.length} primeiras de {falta}, na ordem em que serão tratadas (as que vencem mais perto de hoje primeiro).
            </p>
          )}
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-1.5 font-medium">OC</th>
                <th className="px-3 py-1.5 font-medium">Fornecedor</th>
                <th className="px-3 py-1.5 font-medium">Vencimento</th>
                <th className="px-3 py-1.5 font-medium">Situação</th>
                <th className="px-3 py-1.5 font-medium">Motivo / próximo passo</th>
              </tr>
            </thead>
            <tbody>
              {u.pendentes.map((p) => (
                <tr key={`${p.codFil}|${p.numOcp}`} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 font-medium text-gray-800">{p.numOcp}</td>
                  <td className="max-w-[220px] truncate px-3 py-1.5" title={p.fornecedorNome ?? undefined}>{p.fornecedorNome ?? "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{dataBr(p.vencimento)}</td>
                  <td className={`px-3 py-1.5 font-medium ${COR[p.situacao] ?? ""}`}>{ROTULO[p.situacao] ?? p.situacao}</td>
                  <td className="px-3 py-1.5 text-gray-600">{p.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
