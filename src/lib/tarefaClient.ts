import { pedirHorasDedicadas } from "@/components/HorasDedicadasDialog";

// Alteracao de tarefa feita pelo navegador. Quem conclui uma tarefa precisa informar as horas dedicadas (quando usa o Timesheet automatico): o servidor
// responde 422 HORAS_OBRIGATORIAS, a pessoa informa no dialogo e a mesma alteracao e' reenviada com as horas.

export type ResultadoPatch = { ok: boolean; status: number; cancelado: boolean; erro?: string; dados?: any };

export async function patchTarefa(taskId: string, corpo: Record<string, unknown>, titulo = "esta tarefa", sugerido: number | null = null): Promise<ResultadoPatch> {
  const enviar = (c: Record<string, unknown>) =>
    fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
  let res = await enviar(corpo);
  if (res.status === 422) {
    const j = await res.clone().json().catch(() => null);
    if (j?.code === "HORAS_OBRIGATORIAS") {
      const horas = await pedirHorasDedicadas(titulo, sugerido ?? (typeof j.horasAtuais === "number" ? j.horasAtuais : null));
      if (horas === null) return { ok: false, status: 422, cancelado: true };
      res = await enviar({ ...corpo, horasDedicadas: horas });
    }
  }
  if (res.ok) return { ok: true, status: res.status, cancelado: false, dados: await res.json().catch(() => null) };
  const j = await res.json().catch(() => null);
  return { ok: false, status: res.status, cancelado: false, erro: typeof j?.error === "string" ? j.error : undefined };
}
