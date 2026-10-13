import { NextResponse } from "next/server";
import { carregarDados, exigir, podeEditar } from "@/lib/efetivos/servidor";

export const dynamic = "force-dynamic";

// Tudo que a tela precisa para calcular o painel em qualquer data (sao poucas centenas de linhas).
export async function GET() {
  const a = await exigir("ver");
  if ("erro" in a) return a.erro;
  const editor = podeEditar(a.nivel);
  const dados = await carregarDados(editor);
  return NextResponse.json({ nivel: a.nivel, podeEditar: editor, ...dados });
}
