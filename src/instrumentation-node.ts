// Parte da inicializacao que so' existe no runtime Node (agendadores internos). Fica num arquivo proprio porque o Next compila
// instrumentation.ts tambem para o runtime Edge, que nao tem 'crypto', 'fs' etc.; o import dinamico abaixo, dentro do teste
// de NEXT_RUNTIME, tira este arquivo (e tudo que ele importa) do pacote do Edge.
//
// Liga os agendadores -- so' em producao, e nunca em homologacao/desenvolvimento:
//   - Custo por Contrato e Medicao (CUSTOS_AUTO=0 desliga);
//   - dossies de OC (DOSSIE_AUTO=0 desliga).
export async function iniciarAgendadores() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.APP_ENV === "homologacao") return;
  if (process.env.CUSTOS_AUTO !== "0") {
    const { iniciarAgendadorCustos } = await import("./lib/custos/agendador");
    iniciarAgendadorCustos();
  }
  if (process.env.DOSSIE_AUTO !== "0") {
    const { iniciarAgendadorDossies } = await import("./lib/dossie/agendador");
    iniciarAgendadorDossies();
  }
}
