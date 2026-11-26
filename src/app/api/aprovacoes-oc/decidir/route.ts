import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { decifrar } from "@/lib/segredo";
import { logAudit } from "@/lib/auditLog";
import { decidirOc, listarPendentes } from "@/lib/senior/aprovarOc";

// Aprova/reprova UMA OC na Senior com o login ERP da propria pessoa. ESCREVE no ERP (sem desfazer por aqui).
// Travas: so' vale para OC que esta AGORA na lista de pendentes da pessoa (releitura antes de escrever) e uma decisao por OC
// por vez no processo (duplo clique).
const emAndamento = new Set<string>();
const corpo = z.object({
  acao: z.enum(["aprovar", "reprovar"]),
  codigoEmpresa: z.number().int().positive(),
  codigoFilial: z.number().int().positive(),
  numero: z.number().int().positive(),
});

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = s.user as { id: string; role: string };
  const negado = await negarSemModulo(u, "aprovacoes_oc", "aprovacoes_oc_todas");
  if (negado) return negado;
  const p = corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { acao, ...k } = p.data;

  const d = await prisma.user.findUnique({ where: { id: u.id }, select: { erpUsuario: true, erpSenhaCifrada: true } });
  if (!d?.erpUsuario || !d.erpSenhaCifrada) return NextResponse.json({ error: "Cadastre seu usuário e senha do ERP primeiro." }, { status: 400 });

  const trava = `${k.codigoEmpresa}-${k.codigoFilial}-${k.numero}`;
  if (emAndamento.has(trava)) return NextResponse.json({ error: "Esta OC já está sendo processada." }, { status: 409 });
  emAndamento.add(trava);
  try {
    const cred = { usuario: d.erpUsuario, senha: decifrar(d.erpSenhaCifrada) };
    const pendentes = await listarPendentes(cred);
    if (!pendentes.some((o) => o.codigoEmpresa === k.codigoEmpresa && o.codigoFilial === k.codigoFilial && o.numero === k.numero))
      return NextResponse.json({ error: "Esta OC não está mais pendente para você na Senior. Atualize a lista." }, { status: 409 });

    const r = await decidirOc(acao, cred, k);
    await logAudit({
      userId: u.id,
      action: acao === "aprovar" ? "OC_APROVADA_SENIOR" : "OC_REPROVADA_SENIOR",
      entityType: "OrdemCompra",
      entityId: trava,
      metadata: { erpUsuario: d.erpUsuario, ok: r.ok, mensagem: r.mensagem },
    });
    return r.ok ? NextResponse.json({ ok: true, mensagem: r.mensagem }) : NextResponse.json({ error: `A Senior recusou: ${r.mensagem}` }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao falar com a Senior: ${(e as Error).message}` }, { status: 502 });
  } finally {
    emAndamento.delete(trava);
  }
}
