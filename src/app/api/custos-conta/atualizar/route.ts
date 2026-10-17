import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dispararAtualizacao, estadoAtualizacao } from "@/lib/custos/atualizacaoCusto";

// Botao "Atualizar" da tela Custo por Contrato. O custo e' lido DIRETO do Senior (mesma regra validada contra o
// Rel114/Rito), em segundo plano: o POST so' dispara e responde na hora; a tela acompanha pelo GET (barra de progresso)
// e recarrega os numeros sozinha quando termina. Qualquer usuario logado que enxerga a tela pode disparar -- a
// atualizacao e' a mesma pra todos (cada um continua vendo so' os seus contratos) e e' limitada a uma por vez.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json(await estadoAtualizacao());
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (user.role === "CLIENTE") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const resultado = await dispararAtualizacao(user.name || user.email || "usuário");
  return NextResponse.json({ ...resultado, estado: await estadoAtualizacao() });
}
