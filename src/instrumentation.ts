// Roda uma vez quando o servidor do Next sobe (Next 14: exige experimental.instrumentationHook em next.config.mjs).
// Liga o agendador do Custo por Contrato -- so' em producao, no runtime Node, e nunca em homologacao/desenvolvimento.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.APP_ENV === "homologacao") return;
  if (process.env.CUSTOS_AUTO === "0") return;
  const { iniciarAgendadorCustos } = await import("./lib/custos/agendador");
  iniciarAgendadorCustos();
}
