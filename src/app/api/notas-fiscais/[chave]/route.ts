import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { achatarXml, baixarXmlDaNota } from "@/lib/edocs/notasRecebidas";

// Todos os campos de uma NF-e recebida: o XML autorizado achatado em (caminho, valor).


export async function GET(_req: Request, { params }: { params: { chave: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "notas_fiscais");
  if (negado) return negado;
  if (!/^\d{44}$/.test(params.chave)) return NextResponse.json({ error: "Chave de acesso inválida." }, { status: 422 });
  try {
    return NextResponse.json({ chave: params.chave, campos: achatarXml(await baixarXmlDaNota(params.chave)) });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível ler a nota: ${(e as Error).message}` }, { status: 502 });
  }
}
