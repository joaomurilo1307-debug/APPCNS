import { exigirModulo } from "@/lib/acesso/servidor";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("aprovacoes_oc", "aprovacoes_oc_todas");
  return <>{children}</>;
}
