import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { codigosSeniorDe } from "@/lib/acesso/aprovacoesOc";
import { decifrar } from "@/lib/segredo";
import { logAudit } from "@/lib/auditLog";
import { aprovarRequisicao, listarRequisicoesPendentes } from "@/lib/senior/aprovarRequisicao";
import { avisarRequisicaoAprovada } from "@/lib/avisosAprovacaoERemessa";

// APROVA um item de requisicao de estoque na Senior com o login ERP da propria pessoa (nao ha reprovar nativo). ESCREVE no ERP.
// Travas: so' vale para item que esta AGORA nas pendentes da pessoa (releitura antes de escrever); quantidade aprovada = a pedida;
// uma decisao por item por vez no processo (duplo clique).
const emAndamento = new Set<string>();
const corpo = z.object({
  codigoEmpresa: z.number().int().positive(),
  numero: z.number().int().positive(),
  sequencia: z.number().int().positive(),
});

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = s.user as { id: string; role: string };
  const negado = await negarSemModulo(u, "aprovacoes_oc", "aprovacoes_oc_todas");
  if (negado) return negado;
  const p = corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const k = p.data;

  const d = await prisma.user.findUnique({ where: { id: u.id }, select: { erpUsuario: true, erpSenhaCifrada: true } });
  if (!d?.erpUsuario || !d.erpSenhaCifrada) return NextResponse.json({ error: "Cadastre seu usuário e senha do ERP primeiro." }, { status: 400 });

  const trava = `${k.codigoEmpresa}-${k.numero}-${k.sequencia}`;
  if (emAndamento.has(trava)) return NextResponse.json({ error: "Este item já está sendo processado." }, { status: 409 });
  emAndamento.add(trava);
  try {
    const pendentes = await listarRequisicoesPendentes(await codigosSeniorDe(u.id));
    const r = pendentes.find((x) => x.codigoEmpresa === k.codigoEmpresa && x.numero === k.numero && x.sequencia === k.sequencia);
    if (!r) return NextResponse.json({ error: "Este item não está mais pendente para você na Senior. Atualize a lista." }, { status: 409 });

    const res = await aprovarRequisicao({ usuario: d.erpUsuario, senha: decifrar(d.erpSenhaCifrada) }, r.codUsu, k, r.quantidade);
    await logAudit({
      userId: u.id,
      action: "REQUISICAO_APROVADA_SENIOR",
      entityType: "RequisicaoEstoque",
      entityId: trava,
      metadata: { erpUsuario: d.erpUsuario, codUsu: r.codUsu, quantidade: r.quantidade, ok: res.ok, mensagem: res.mensagem },
    });
    // aviso ao solicitante em segundo plano: nao atrasa nem derruba a aprovacao
    if (res.ok) void avisarRequisicaoAprovada(r, s.user?.name ?? d.erpUsuario);
    return res.ok ? NextResponse.json({ ok: true, mensagem: res.mensagem }) : NextResponse.json({ error: `A Senior recusou: ${res.mensagem}` }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao falar com a Senior: ${(e as Error).message}` }, { status: 502 });
  } finally {
    emAndamento.delete(trava);
  }
}
