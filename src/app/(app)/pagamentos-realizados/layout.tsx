import { exigirModulo } from "@/lib/acesso/servidor";

// Mesmo acesso da Programacao de Pagamento: a pagina so' le /api/titulos-pagar, entao nao ha modulo novo a liberar.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("programacao_pagamento");
  return <>{children}</>;
}
