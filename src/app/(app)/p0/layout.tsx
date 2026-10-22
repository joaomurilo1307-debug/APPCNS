import { exigirModulo } from "@/lib/acesso/servidor";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("p0");
  return <>{children}</>;
}
