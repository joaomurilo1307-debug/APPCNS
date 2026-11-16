"use client";

import { useEffect, useRef, useState } from "react";

// Pergunta, na hora de concluir uma tarefa, quantas horas a pessoa dedicou a ela. Obrigatorio para quem usa o Timesheet automatico: e' a base do calculo de
// horas por centro de custo. Montado uma vez no layout; quem precisa das horas chama `pedirHorasDedicadas` (veja src/lib/tarefaClient.ts).

type Pedido = { titulo: string; sugerido: number | null; resolver: (horas: number | null) => void };
let abrirDialogo: ((p: Pedido) => void) | null = null;

/** Abre o dialogo e devolve as horas informadas (null = a pessoa desistiu de concluir). */
export function pedirHorasDedicadas(titulo: string, sugerido: number | null = null): Promise<number | null> {
  return new Promise((resolver) => {
    if (abrirDialogo) abrirDialogo({ titulo, sugerido, resolver });
    else {
      const t = window.prompt(`Quantas horas você dedicou à tarefa “${titulo}”? (obrigatório para concluir)`);
      const n = t ? Number(t.replace(",", ".")) : NaN;
      resolver(Number.isFinite(n) && n > 0 ? n : null);
    }
  });
}

export default function HorasDedicadasDialog() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    abrirDialogo = (p) => {
      setPedido(p);
      setTexto(p.sugerido ? String(p.sugerido).replace(".", ",") : "");
      setErro("");
    };
    return () => { abrirDialogo = null; };
  }, []);
  useEffect(() => { if (pedido) campo.current?.focus(); }, [pedido]);

  if (!pedido) return null;
  const encerrar = (horas: number | null) => { pedido.resolver(horas); setPedido(null); };
  const confirmar = () => {
    const n = Number(texto.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) { setErro("Informe as horas em número, maior que zero (ex.: 6 ou 4,5)."); return; }
    if (n > 5000) { setErro("Esse valor parece alto demais. Confira as horas."); return; }
    encerrar(Math.round(n * 100) / 100);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="horas-titulo" onKeyDown={(e) => e.key === "Escape" && encerrar(null)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="horas-titulo" className="text-base font-semibold text-gray-900">{pedido.sugerido ? "Confirme o total de horas dedicadas a esta tarefa" : "Quantas horas você dedicou a esta tarefa?"}</h2>
        <p className="mt-1 truncate text-sm text-gray-500" title={pedido.titulo}>{pedido.titulo}</p>
        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="horas-campo">Horas dedicadas (a tarefa inteira)</label>
        <input
          id="horas-campo"
          ref={campo}
          inputMode="decimal"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setErro(""); }}
          onKeyDown={(e) => e.key === "Enter" && confirmar()}
          placeholder="ex.: 6 ou 4,5"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
        />
        {erro && <p className="mt-1 text-sm text-red-600" role="alert">{erro}</p>}
        <p className="mt-2 text-xs text-gray-500">{pedido.sugerido ? "Você já tinha informado este valor; se trabalhou mais desde então, atualize para o total até a conclusão. " : "Some o tempo de todos os dias em que você trabalhou nela. "}Obrigatório para concluir: é a base do seu Timesheet automático e do custo do projeto. Você pode corrigir depois, na lista de tarefas.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => encerrar(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={confirmar} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Concluir tarefa</button>
        </div>
      </div>
    </div>
  );
}
