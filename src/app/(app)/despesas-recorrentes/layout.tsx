import { exigirModulo } from "@/lib/acesso/servidor";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("despesas_recorrentes");
  return <>{children}</>;
}
