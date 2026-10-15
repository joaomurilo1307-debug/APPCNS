import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COD_EMP, dataIso, lerOcParaTitulo, numeroSenior, tituloExiste } from "@/lib/senior/ocsConferencia";
import { gravarTituloCP, TNS_PADRAO, TPT_PADRAO } from "@/lib/senior/gravarTitulo";
import { lerAprovacaoOc } from "@/lib/senior/aprovacaoOc";
import { situacaoNfNoSenior } from "@/lib/senior/nfEntrada";
import { montarPagamentoDoTitulo } from "@/lib/senior/pagamentoParaTitulo";

// Gera na Senior (GravarTitulosCP_4) o titulo a pagar de UMA OC. Tudo e' relido
// da Senior na hora -- o navegador so' manda qual OC e o numero do titulo.
// Bloqueia: aprovacao multinivel incompleta (E420OCP/E614APR/E614USU), OC que ja tem titulo
// (USU_NUMTIT, registro local ou titulo igual na Senior).

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const schema = z.object({
  numOcp: z.string().regex(/^\d+$/),
  codFil: z.string().regex(/^\d+$/),
  numTit: z.string().regex(/^[A-Za-z0-9]{1,15}$/),
  codTpt: z.string().regex(/^[A-Za-z0-9]{1,3}$/).default(TPT_PADRAO),
});

const recusa = (error: string, status = 409) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return recusa("Não autenticado", 401);
  const user = session.user as any;
  if (!PAPEIS.includes(user.role)) return recusa("Sem permissão", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return recusa("Dados inválidos (número do título: letras/números, até 15).", 422);
  const { numOcp, codFil, numTit } = parsed.data;
  const codTpt = parsed.data.codTpt.toUpperCase();

  let lida;
  try {
    lida = await lerOcParaTitulo(numOcp, codFil);
    if (!lida) return recusa("OC não encontrada na Senior.", 404);
    const { oc } = lida;
    const aprovacao = await lerAprovacaoOc(numOcp, codFil);
    if (!aprovacao?.completa) return recusa(`Aprovação incompleta: ${aprovacao?.motivoIncompleta ?? "não foi possível ler a aprovação"}`);
    if ((oc.USU_NUMTIT ?? "").trim()) return recusa(`OC já tem título informado na Senior (${oc.USU_NUMTIT}).`);
    if (await prisma.tituloGeradoOC.findUnique({ where: { numOcp_codFil: { numOcp, codFil } } })) return recusa("Já foi gerado um título para esta OC.");
    // Fluxo normal: a entrada da NF na Senior costuma gerar o título sozinha. Não duplicar.
    for (const nf of await prisma.nfAssociadaOC.findMany({ where: { numOcp, codFil } })) {
      const s = await situacaoNfNoSenior(oc.CODFOR, nf.numeroNf);
      if (s.tituloDaNf) return recusa(`A NF ${nf.numeroNf} associada a esta OC já gerou o título ${s.tituloDaNf} na Senior.`);
    }
    if (await tituloExiste(oc.CODFOR, numTit, codTpt)) return recusa(`Já existe o título ${codTpt} ${numTit} deste fornecedor na Senior.`);
  } catch (e) {
    return recusa(`Não foi possível conferir na Senior: ${(e as Error).message}`, 502);
  }

  const { oc, rateio } = lida;
  const vencimento = dataIso(oc.USU_DATVECT);
  const emissao = dataIso(oc.DATEMI);
  const valor = numeroSenior(oc.VLRLIQ);
  if (!vencimento || !emissao || valor <= 0) return recusa("OC sem vencimento (USU_DATVECT), emissão ou valor válido.", 422);

  let pagamento;
  try {
    pagamento = await montarPagamentoDoTitulo(oc, oc.CODFOR, codFil);
  } catch (e) {
    return recusa(`Não foi possível ler os dados de pagamento na Senior: ${(e as Error).message}`, 502);
  }
  const um = rateio.length === 1 ? rateio[0] : null; // rateio múltiplo: CCU/conta ficam pro financeiro
  const venc = new Date(`${vencimento}T00:00:00Z`);

  // Reserva a OC ANTES de escrever na Senior: dois cliques/usuários não geram dois títulos.
  try {
    await prisma.tituloGeradoOC.create({
      data: { numOcp, codFil, codFor: oc.CODFOR, numTit, codTpt, valor, vencimento: venc, geradoPor: user.name ?? user.email ?? "?" },
    });
  } catch {
    return recusa("Já foi gerado um título para esta OC.");
  }

  try {
    const r = await gravarTituloCP({
      codEmp: COD_EMP,
      codFil: Number(codFil),
      numTit,
      codTpt,
      codFor: Number(oc.CODFOR),
      codTns: TNS_PADRAO,
      emissao: new Date(`${emissao}T00:00:00Z`),
      vencimento: venc,
      valor,
      obs: `VALOR BRUTO:R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} - ${(oc.OBSOCP ?? "").trim()} (OC ${numOcp})`,
      ...pagamento.campos,
      codPor: oc.CODPOR || undefined,
      codCrt: oc.CODCRT || undefined,
      codCcu: um?.CODCCU || undefined,
      ctaFin: um?.CTAFIN || undefined,
      numPrj: um?.NUMPRJ || undefined,
      codFpj: um?.CODFPJ || undefined,
    });
    if (!r.ok) {
      await prisma.tituloGeradoOC.delete({ where: { numOcp_codFil: { numOcp, codFil } } });
      return recusa(`A Senior recusou o título: ${r.erroExecucao || r.mensagem || "sem detalhe"}`, 422);
    }
    return NextResponse.json({
      ok: true,
      numTit,
      codTpt,
      mensagem: r.mensagem,
      avisos: [
        ...(rateio.length > 1 ? ["OC com rateio em mais de um centro de custo: complete CCU/conta financeira do título na Senior."] : []),
        ...pagamento.avisos,
      ],
    });
  } catch (e) {
    // Falha de rede/timeout: a Senior pode ter gravado. Mantém a reserva (bloqueia repetição) e manda conferir.
    return recusa(`Sem resposta confiável da Senior (${(e as Error).message}). Confira se o título ${codTpt} ${numTit} foi criado antes de tentar de novo.`, 502);
  }
}
