import { exigirModulo } from "@/lib/acesso/servidor";

// Mesmo acesso da tela Aprovacoes (OC Senior).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("aprovacoes_oc", "aprovacoes_oc_todas");
  return <>{children}</>;
}
