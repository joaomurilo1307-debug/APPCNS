import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aplicarCorrecaoManual, criarMotorVinculo } from "@/lib/vinculoOcTitulo";
import { buscarDadosPagamento, type PedidoTitulo } from "@/lib/senior/dadosPagamentoTitulos";
import { sincronizacaoEmCurso } from "@/lib/senior/formasPagamento";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

const bodySchema = z.object({ tituloIds: z.array(z.string().min(1)).min(1).max(120), conferencia: z.boolean().optional() });

// Le AO VIVO na Senior (so' leitura) o que ela tem de dado de pagamento dos
// titulos pedidos: CPF/CNPJ, conta, chave PIX, forma de pagamento. Existe pra
// o carrinho de remessa nao ficar dependendo do sincronismo agendado (que roda
// no VPS e pode estar atrasado ou nao trazer tudo). Nao grava nada.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const [titulos, ocs] = await Promise.all([
    prisma.tituloContasAPagar.findMany({ where: { id: { in: parsed.data.tituloIds } } }),
    prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true,
        codFil: true,
        fornecedorCodigo: true,
        fornecedorNome: true,
        valor: true,
        dataEmissao: true,
        situacaoAtual: true,
        usuNumTit: true,
        usuNumNfc: true,
        codccu: true,
        contratoNome: true,
        temRateio: true,
        previsaoPagamento: true,
      },
    }),
  ]);

  // OC do titulo: mesma regra da Programacao de Pagamento (so' vinculo com prova
  // -- referencia, NF, parcela ou correcao manual --, nunca "parece que e' essa").
  const motor = criarMotorVinculo(ocs);
  const ocPorNumero = new Map(ocs.map((o) => [o.numOcp, o]));
  const naoPagamento = titulos.filter((t) => t.tipo === "PRV"); // provisao contabil: nao ha o que buscar
  const ocDoTitulo = new Map<string, string | null>();
  const pedidos: PedidoTitulo[] = [];
  for (const t of titulos) {
    if (t.tipo === "PRV") continue;
    const vinculo = aplicarCorrecaoManual(t, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t));
    const numOcp = vinculo.ocRelacionada?.numOcp ?? null;
    ocDoTitulo.set(t.id, numOcp);
    const candidatasOc = ocs.filter(o=>o.numOcp === numOcp && o.fornecedorCodigo === t.codFor);
    pedidos.push({ tituloId: t.id, numTit: t.numTit, codFil: t.codFil, codFor: t.codFor, numOcp, codFilOc: t.filOcp ?? (candidatasOc.length === 1 ? candidatasOc[0].codFil : null), tipo: t.tipo, dataEmissao: t.dataEmissao.toISOString().slice(0, 10) });
  }

  // A varredura em segundo plano dos titulos abertos (formas de pagamento) ocupa
  // a fila da Senior por ~1 min; consultar junto estoura o tempo. Espera ela
  // terminar (no maximo 75s) antes de perguntar.
  const emCurso = sincronizacaoEmCurso();
  if (emCurso) {
    await Promise.race([emCurso.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 75_000))]);
  }

  const { dados, avisos } = await buscarDadosPagamento(pedidos, parsed.data.conferencia === true);
  return NextResponse.json({
    consultadoEm: new Date().toISOString(),
    // Todas as consultas à Senior responderam? Sem isso a tela não pode afirmar "a Senior não tem nada".
    completo: avisos.length === 0,
    dados: dados.map((d) => ({ ...d, numOcp: ocDoTitulo.get(d.tituloId) ?? null })),
    provisoes: naoPagamento.map((t) => t.id),
    avisos,
  });
}
