import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Associa, depois do retorno do banco, um titulo a um pagamento que ficou sem
// tituloId (o vinculo se perde quando o sincronismo recria o titulo). So' liga
// o item ao titulo: a baixa na Senior continua passando por "Conferir na Senior",
// que confere o titulo ao vivo. Exige o mesmo valor do pagamento e titulo aberto.

const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];
const STATUS_ATIVOS = ["PENDENTE", "AGENDADO", "PAGO"] as const;
const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 0.01;
const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

async function carregar(id: string) {
  const item = await prisma.remessaItemPagamento.findUnique({ where: { id } });
  if (!item) return { erro: NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 }) } as const;
  if (item.tituloId) return { erro: NextResponse.json({ error: "Este pagamento já tem título vinculado." }, { status: 409 }) } as const;
  if (!STATUS_ATIVOS.includes(item.status as any)) return { erro: NextResponse.json({ error: `Pagamento ${item.status}: não pode receber título.` }, { status: 409 }) } as const;
  return { item } as const;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const c = await carregar(params.id);
  if ("erro" in c) return c.erro;
  const { item } = c;

  const doc = soDigitos(item.favorecidoDocumento);
  const titulos = doc
    ? await prisma.tituloContasAPagar.findMany({
        where: { pago: false, documentoFavorecido: doc, situacao: { in: ["AB", "PE"] } },
        select: { id: true, numTit: true, tipo: true, codFor: true, fornecedorNome: true, valorAberto: true, vencimentoProgramado: true, situacao: true },
        orderBy: { vencimentoProgramado: "asc" },
      })
    : [];
  const ocupados = new Set(
    (await prisma.remessaItemPagamento.findMany({ where: { tituloId: { in: titulos.map((t) => t.id) }, status: { in: [...STATUS_ATIVOS] } }, select: { tituloId: true } })).map((i) => i.tituloId)
  );
  const valor = item.valorEfetivado ?? item.valor;
  const candidatos = titulos
    .filter((t) => mesmoValor(t.valorAberto, valor) && !ocupados.has(t.id));
  return NextResponse.json({ valor, candidatos });
}

const bodySchema = z.object({ tituloId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const c = await carregar(params.id);
  if ("erro" in c) return c.erro;
  const { item } = c;

  const titulo = await prisma.tituloContasAPagar.findUnique({ where: { id: parsed.data.tituloId } });
  if (!titulo) return NextResponse.json({ error: "Título não encontrado." }, { status: 404 });
  if (titulo.pago || !["AB", "PE"].includes(titulo.situacao)) return NextResponse.json({ error: "O título não está aberto." }, { status: 409 });
  if (!mesmoValor(titulo.valorAberto, item.valorEfetivado ?? item.valor)) return NextResponse.json({ error: "O valor do título é diferente do valor do pagamento." }, { status: 409 });
  const doc = soDigitos(item.favorecidoDocumento);
  if (!doc || soDigitos(titulo.documentoFavorecido) !== doc) return NextResponse.json({ error: "O CPF/CNPJ do título não é o do favorecido do pagamento." }, { status: 409 });

  const outro = await prisma.remessaItemPagamento.findFirst({ where: { tituloId: titulo.id, id: { not: item.id }, status: { in: [...STATUS_ATIVOS] } } });
  if (outro) return NextResponse.json({ error: "Este título já está ligado a outro pagamento ativo." }, { status: 409 });

  await prisma.$transaction([
    prisma.remessaItemPagamento.update({ where: { id: item.id }, data: { tituloId: titulo.id } }),
    prisma.auditLog.create({ data: { userId: user.id, action: "PAGAMENTO_TITULO_VINCULADO_MANUAL", entityType: "RemessaItemPagamento", entityId: item.id, metadata: JSON.stringify({ tituloId: titulo.id, numTit: titulo.numTit, codFor: titulo.codFor, tipo: titulo.tipo }) } }),
  ]);
  return NextResponse.json({ ok: true, numTit: titulo.numTit });
}
