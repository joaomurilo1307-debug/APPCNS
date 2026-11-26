import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { codigosSeniorDe } from "@/lib/acesso/aprovacoesOc";
import { listarRequisicoesPendentes } from "@/lib/senior/aprovarRequisicao";

// Requisicoes de estoque aguardando a aprovacao DO USUARIO LOGADO (SQL somente leitura: aprovador do centro de custo da requisicao).
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = s.user as { id: string; role: string };
  const negado = await negarSemModulo(u, "aprovacoes_oc", "aprovacoes_oc_todas");
  if (negado) return negado;

  const codigos = await codigosSeniorDe(u.id);
  if (!codigos.length) return NextResponse.json({ semVinculo: true, requisicoes: [] });
  try {
    return NextResponse.json({ semVinculo: false, requisicoes: await listarRequisicoesPendentes(codigos) });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível ler as requisições na Senior: ${(e as Error).message}` }, { status: 502 });
  }
}
