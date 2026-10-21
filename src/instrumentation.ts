// Roda uma vez quando o servidor do Next sobe (Next 14: exige experimental.instrumentationHook em next.config.mjs).
// Liga os agendadores internos (Custo por Contrato/Medicao e dossies de OC) -- ver instrumentation-node.ts, que so' e'
// carregado no runtime Node.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarAgendadores } = await import("./instrumentation-node");
    await iniciarAgendadores();
  }
}
