import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { carregarAoVivo, nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { notificacaoIndicado, notificacaoNova, validarPedido } from "@/lib/contestacoes";
import { avisar, destinatariosDaRevisao, ehRevisorDeContestacao } from "@/lib/contestacoesServidor";
import { saveUploadedFile, validateUploadFile } from "@/lib/uploadValidation";
import { logAudit } from "@/lib/auditLog";

// Contestacao de custo (tela Ao vivo). POST cria (multipart: chave, justificativa, indicadoId opcional, arquivos). GET devolve:
//   ?chaves=a,b,c   -> o estado da contestacao de cada lancamento da tela (para o selo "Contestado")
//   ?visao=aprovacao -> a lista da aba Aprovacoes: o revisor ve todas; os demais, so' as que fez ou em que foram indicados.

const selecao = {
  id: true, criadoEm: true, chave: true, codccu: true, ccuNome: true, origem: true, numTit: true, numOcp: true, fornecedor: true, linhaCusto: true, valor: true,
  dataLancamento: true, justificativa: true, status: true, parecer: true, decididoEm: true,
  autor: { select: { id: true, name: true } },
  indicado: { select: { id: true, name: true } },
  decididoPor: { select: { id: true, name: true } },
  anexos: { select: { id: true, nome: true, tamanho: true } },
} as const;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;

  if (sp.get("chaves")) {
    const chaves = sp.get("chaves")!.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 300);
    const escopo = await escopoDeCustos(prisma, user);
    const linhas = await prisma.contestacaoCusto.findMany({
      where: { chave: { in: chaves } },
      orderBy: { criadoEm: "desc" },
      select: { id: true, chave: true, codccu: true, status: true, indicado: { select: { name: true } } },
    });
    const porChave: Record<string, { id: string; status: string; indicado: string | null }> = {};
    for (const l of linhas) if (!porChave[l.chave] && podeVerCcu(escopo, l.codccu)) porChave[l.chave] = { id: l.id, status: l.status, indicado: l.indicado?.name ?? null };
    return NextResponse.json({ porChave });
  }

  const revisor = await ehRevisorDeContestacao(user);
  const itens = await prisma.contestacaoCusto.findMany({
    where: revisor ? {} : { OR: [{ autorId: user.id }, { indicadoId: user.id }] },
    orderBy: { criadoEm: "desc" },
    take: 300,
    select: selecao,
  });
  // as pendentes primeiro (a ordem alfabetica do status poria ACEITA antes); dentro de cada grupo, a mais nova primeiro
  itens.sort((x, y) => Number(y.status === "PENDENTE") - Number(x.status === "PENDENTE"));
  return NextResponse.json({ revisor, itens });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(user, "custos", "contratos");
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envie o formulário completo." }, { status: 422 });
  const chave = String(form.get("chave") ?? "");
  const justificativa = String(form.get("justificativa") ?? "").trim();
  const indicadoId = String(form.get("indicadoId") ?? "").trim() || null;
  const arquivos = form.getAll("arquivos").filter((f): f is File => typeof f !== "string" && f.size > 0);

  const erro = validarPedido({ chave, justificativa, arquivos: arquivos.map((a) => ({ name: a.name, size: a.size })) });
  if (erro) return NextResponse.json({ error: erro }, { status: 422 });
  for (const a of arquivos) {
    const v = validateUploadFile(a);
    if (!v.ok) return NextResponse.json({ error: `${a.name}: ${v.error}` }, { status: v.status });
  }

  // o lancamento vem do servidor (nunca do navegador) e precisa estar num centro de custo que a pessoa enxerga
  const dados = await carregarAoVivo(prisma, hojeBR());
  const item = dados.itens.find((i) => i.chave === chave);
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado no Ao vivo. Atualize a tela e tente de novo." }, { status: 404 });
  const escopo = await escopoDeCustos(prisma, user);
  if (!podeVerCcu(escopo, item.ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });

  const repetida = await prisma.contestacaoCusto.findFirst({ where: { chave, autorId: user.id, status: "PENDENTE" }, select: { id: true } });
  if (repetida) return NextResponse.json({ error: "Você já contestou este lançamento e o financeiro ainda não decidiu." }, { status: 409 });

  if (indicadoId) {
    const indicado = await prisma.user.findUnique({ where: { id: indicadoId }, select: { active: true, role: true } });
    if (!indicado || !indicado.active || indicado.role === "CLIENTE") return NextResponse.json({ error: "A pessoa indicada não pode receber contestações." }, { status: 422 });
  }

  const ccuNome = (await nomesDosCentros(prisma, [item.ccu])).get(item.ccu) ?? null;
  const criada = await prisma.contestacaoCusto.create({
    data: {
      chave, codccu: item.ccu, ccuNome, origem: item.origem, numTit: item.numTit, numOcp: item.numOcp, fornecedor: item.fornecedor, linhaCusto: item.linhaCusto,
      valor: item.valor, dataLancamento: item.data ? item.data.slice(0, 10) : null, autorId: user.id, justificativa, indicadoId,
    },
    select: { id: true },
  });
  try {
    for (const a of arquivos) {
      const { filePath, fileSize } = await saveUploadedFile(a, `contestacoes/${criada.id}`);
      await prisma.contestacaoAnexo.create({ data: { contestacaoId: criada.id, nome: a.name.slice(0, 200), caminho: filePath, tamanho: fileSize } });
    }
  } catch {
    await prisma.contestacaoCusto.delete({ where: { id: criada.id } }).catch(() => {});
    return NextResponse.json({ error: "Não foi possível salvar os arquivos. Tente de novo." }, { status: 500 });
  }

  const resumo = { fornecedor: item.fornecedor, numTit: item.numTit, numOcp: item.numOcp, valor: item.valor, ccuNome, codccu: item.ccu };
  const revisores = (await destinatariosDaRevisao()).filter((id) => id !== user.id);
  const n = notificacaoNova(resumo, user.name ?? "Alguém");
  await avisar(revisores, { ...n, tipo: "APROVACAO_PENDENTE" });
  if (indicadoId && indicadoId !== user.id) await avisar([indicadoId], notificacaoIndicado(resumo, user.name ?? "Alguém"));
  await logAudit({ userId: user.id, action: "contestacao.criar", entityType: "ContestacaoCusto", entityId: criada.id, metadata: { chave, codccu: item.ccu, indicadoId, anexos: arquivos.length } });
  return NextResponse.json({ id: criada.id }, { status: 201 });
}
