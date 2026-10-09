import { NextResponse } from "next/server";
import { homologacaoLocalSegura } from "@/lib/ambienteHomologacao";

export const dynamic = "force-dynamic";

// As suites HTTP conferem o ambiente do servidor alvo antes de qualquer escrita.
// Nao retorna credenciais ou configuracao; nao fica disponivel em producao.
export async function GET() {
  if (!homologacaoLocalSegura()) return NextResponse.json({ error: "Indisponível" }, { status: 404 });
  return NextResponse.json({ ambiente: "homologacao", senior: "SIMULADA", baseTeste: true });
}
