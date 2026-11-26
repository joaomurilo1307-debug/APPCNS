import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { negarSemEdicao } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { COD_EMP } from "@/lib/senior/ocsConferencia";
import { carregarGruposFornecedores } from "@/lib/senior/vinculosOc";
import { mesmoGrupoFornecedor } from "@/lib/vinculoOcTitulo";

// Conferencia de OC: confirma que o titulo PROVAVEL (mesmo fornecedor, valor e vencimento, mas sem nada ligando os dois na Senior)
// e' mesmo o titulo da OC. Grava em TituloOcVinculo -- o mesmo vinculo manual da Programacao de Pagamento --, entao a OC sai da
// Conferencia e o titulo aparece ligado a ela na Programacao. Confere na Senior (so' leitura) que a OC e o titulo existem, que o
// titulo nao esta cancelado e que o fornecedor e' o mesmo (ou do mesmo grupo). Nao escreve nada na Senior.

const schema = z.object({
  numOcp: z.string().trim().regex(/^\d{1,9}$/),
  codFil: z.string().trim().regex(/^\d{1,4}$/),
  numTit: z.string().trim().regex(/^[A-Za-z0-9$+=/._-]{1,15}$/),
  codFor: z.string().trim().regex(/^\d{1,9}$/),
  codFilTitulo: z.string().trim().regex(/^\d{1,4}$/),
});

const recusa = (error: string, status = 422) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  const negado = await negarSemEdicao(user, "conferencia_oc");
  if (negado) return negado;

  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return recusa("Dados do título ou da OC inválidos.");
  const { numOcp, codFil, numTit, codFor, codFilTitulo } = p.data;

  let oc, titulo;
  try {
    [oc] = await consultarSenior(`SELECT NUMOCP, CODFOR, SITOCP FROM E420OCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`);
    [titulo] = await consultarSenior(
      `SELECT CODFIL, CODFOR, NUMTIT, CODTPT, SITTIT FROM E501TCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFilTitulo} AND CODFOR = ${codFor} AND NUMTIT = '${numTit.replace(/'/g, "")}'`
    );
  } catch (e) {
    return recusa(`Não foi possível conferir na Senior: ${(e as Error).message}`, 502);
  }
  if (!oc) return recusa(`OC ${numOcp} não encontrada na Senior.`, 404);
  if ((oc.SITOCP ?? "").trim() === "5") return recusa(`A OC ${numOcp} está cancelada na Senior.`);
  if (!titulo) return recusa(`Título ${numTit} do fornecedor ${codFor} não encontrado na Senior.`, 404);
  if ((titulo.SITTIT ?? "").trim().toUpperCase() === "CA") return recusa(`O título ${numTit} está cancelado na Senior.`);
  const mesmo = String(Number(oc.CODFOR)) === String(Number(titulo.CODFOR)) || mesmoGrupoFornecedor(await carregarGruposFornecedores(), titulo.CODFOR, oc.CODFOR);
  if (!mesmo) return recusa(`O título ${numTit} é de outro fornecedor (${titulo.CODFOR}) e a OC ${numOcp} é do fornecedor ${oc.CODFOR}.`);

  const chave = { numTit: titulo.NUMTIT.trim(), codFil: titulo.CODFIL.trim(), codFor: titulo.CODFOR.trim() };
  const atual = await prisma.tituloOcVinculo.findUnique({ where: { numTit_codFil_codFor: chave } });
  if (atual && atual.numOcp !== numOcp) {
    return recusa(`O título ${numTit} já está ligado à OC ${atual.numOcp} (por ${atual.criadoPorNome}). Desfaça na Programação de Pagamento antes, se estiver errado.`, 409);
  }
  const quem = user.name ?? user.email ?? "Usuário";
  await prisma.tituloOcVinculo.upsert({
    where: { numTit_codFil_codFor: chave },
    create: { ...chave, numOcp, criadoPorNome: quem },
    update: { numOcp, criadoPorNome: quem, criadoEm: new Date() },
  });
  await logAudit({
    userId: user.id ?? null,
    action: "conferencia_oc.vincular_titulo",
    entityType: "TituloOcVinculo",
    entityId: `${chave.codFor}|${chave.numTit}`,
    metadata: { numOcp, filialOc: codFil, ...chave, codTpt: titulo.CODTPT, antes: atual?.numOcp ?? null },
  });
  return NextResponse.json({ ok: true, numOcp, numTit: chave.numTit });
}
