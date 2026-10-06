import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conferirItensRemessa, itemRemessaSchema } from "@/lib/pagamentos/conferenciaRemessa";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

// contaBancariaId e' opcional: com ela, a conferencia tambem faz o ensaio do
// arquivo CNAB (que depende dos dados da conta debitada) e aponta o titulo que
// quebraria a geracao; sem ela, confere so' os dados de cada item.
const bodySchema = z.object({ itens: z.array(itemRemessaSchema).max(500), contaBancariaId: z.string().optional() });

// Relatorio de conferencia do carrinho ANTES de gerar a remessa: por item, o
// que falta ou esta errado. Nao grava nada -- e' o mesmo relatorio que a
// geracao (POST /remessas) usa pra decidir se pode ou nao gerar.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const conta = parsed.data.contaBancariaId
    ? await prisma.contaBancaria.findUnique({ where: { id: parsed.data.contaBancariaId } })
    : null;
  const relatorio = await conferirItensRemessa(
    parsed.data.itens,
    conta && conta.ativo
      ? { cnpj: conta.cnpj, agencia: conta.agencia, conta: conta.conta, dac: conta.dac, nomeEmpresa: conta.apelido }
      : undefined
  );
  return NextResponse.json(relatorio);
}
