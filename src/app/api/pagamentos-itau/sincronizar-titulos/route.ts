import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemEdicao } from "@/lib/acesso/servidor";
import { iniciarSincronizacao } from "@/lib/senior/sincronizacao/execucao";

// Botao "Atualizar do Senior agora" do /pagamentos-itau.
//
// 30/09/2026: esta rota consultava a Senior DENTRO do proprio request (titulos + fornecedores + cadastro bancario): estourava
// o tempo do proxy (502) ou derrubava a conexao da Senior com consultas em paralelo. Passou a disparar o webhook do n8n (script
// no VPS). 12/11/2026: o proprio sistema busca os titulos na Senior em SEGUNDO PLANO, uma consulta por vez
// (src/lib/senior/sincronizacao/) -- a rota so' comeca a busca e volta; a tela acompanha em GET /api/senior/sincronizacao.
const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const negado = await negarSemEdicao(session.user as any, "pagamentos_itau");
  if (negado) return negado;

  const r = iniciarSincronizacao("titulos", "BOTAO", user?.name ?? null);
  return NextResponse.json({ ok: true, fonte: "titulos", iniciadaEm: r.iniciadaEm.toISOString(), jaEmAndamento: r.jaEmAndamento }, { status: 202 });
}
