import { exigirModulo } from "@/lib/acesso/servidor";

// Quem contesta (contratos/custos) ve as suas; o financeiro (modulo "Aprovar contestacoes de custo") ve todas e atualiza.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("contestacoes_custo", "custos", "contratos");
  return <>{children}</>;
}
