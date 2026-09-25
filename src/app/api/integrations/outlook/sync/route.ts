import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pullEvents } from "@/lib/microsoftGraph";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  try {
    const result = await pullEvents(userId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Falha ao sincronizar" }, { status: 500 });
  }
}
