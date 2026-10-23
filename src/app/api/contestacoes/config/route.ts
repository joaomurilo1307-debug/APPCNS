import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { lerListaDeEmails } from "@/lib/contestacoes";
import { ehRevisorDeContestacao, enderecosDaRevisao, emailsConfigurados, gravarEmailsConfigurados } from "@/lib/contestacoesServidor";
import { logAudit } from "@/lib/auditLog";

// E-mails que recebem os pedidos de contestacao de custo (alem das pessoas com o modulo). So' o financeiro que revisa (e o admin) ve e muda.
async function revisor() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!(await ehRevisorDeContestacao(user))) return { erro: NextResponse.json({ error: "Só o financeiro que decide contestações" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { erro } = await revisor();
  if (erro) return erro;
  return NextResponse.json({ emails: (await emailsConfigurados()).join(", "), destinos: (await enderecosDaRevisao()).map((d) => d.email) });
}

export async function PUT(req: Request) {
  const { erro, user } = await revisor();
  if (erro) return erro;
  const parsed = z.object({ emails: z.string().max(2000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 422 });
  const { validos, invalidos } = lerListaDeEmails(parsed.data.emails);
  if (invalidos.length) return NextResponse.json({ error: `E-mail inválido: ${invalidos.join(", ")}` }, { status: 422 });
  await gravarEmailsConfigurados(validos);
  await logAudit({ userId: user!.id, action: "contestacao.emails", entityType: "Configuracao", metadata: { quantidade: validos.length } });
  return NextResponse.json({ emails: validos.join(", "), destinos: (await enderecosDaRevisao()).map((d) => d.email) });
}
