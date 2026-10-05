import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chavesFornecedor, normalizarReferencia } from "@/lib/vinculoOcTitulo";
import { avisarCriadorOc, type ResultadoAviso } from "@/lib/avisoPagamentoAprovado";

// Marcacao manual de conferencia (30/09/2026): quando o vinculo com OC nao
// e' automatico, alguem confere na origem (Senior) e registra aqui o
// resultado -- nao mexe em nada do motor de vinculoOcTitulo.ts, e' so' um
// rastro de acompanhamento pra saber o que ja foi olhado.
const bodySchema = z.object({
  // ENVIADO_AGUARDANDO_BAIXA (01/10/2026): pagamento ja' foi enviado ao banco
  // fora deste app (ou via remessa gerada aqui), mas a baixa no Senior ainda
  // nao foi lancada por quem cuida disso -- "pago" continua vindo SO' do
  // VLRABE da Senior (nunca forcado por aqui), isso e' so' um rastro pra
  // nao confundir "ja mandei, falta so' a baixa" com "backlog esquecido".
  revisadoStatus: z.enum(["APROVADO", "CORRIGIDO", "SEM_OC_CONFIRMADO", "AGUARDANDO_COMPRAS", "ENVIADO_AGUARDANDO_BAIXA"]).nullable(),
  revisadoObs: z.string().max(500).nullable().optional(),
  // numOcpCorrigido (01/10/2026, pedido do Joao: "deveria ter como vincular
  // uma oc ao titulo sem nf") -- so' aceito junto com revisadoStatus =
  // CORRIGIDO; validado contra a OC sincronizada (existe + mesmo fornecedor)
  // pra nao deixar passar numero digitado errado ou vinculo cruzado entre
  // empresas diferentes, mesmo sem exigir NF nenhuma.
  numOcpCorrigido: z.string().trim().max(30).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  const existente = await prisma.tituloContasAPagar.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });

  const numOcpDigitado = parsed.data.numOcpCorrigido ? normalizarReferencia(parsed.data.numOcpCorrigido) : null;
  let numOcpCorrigido: string | null = null;
  if (numOcpDigitado) {
    if (parsed.data.revisadoStatus !== "CORRIGIDO") {
      return NextResponse.json({ error: "numOcpCorrigido só pode ser enviado junto com revisadoStatus = CORRIGIDO" }, { status: 422 });
    }
    const oc = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: numOcpDigitado } });
    if (!oc) {
      return NextResponse.json({ error: `OC ${numOcpDigitado} não encontrada na base sincronizada` }, { status: 422 });
    }
    const fornecedorBate = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome).some((chave) =>
      chavesFornecedor(existente.codFor, existente.fornecedorNome).includes(chave)
    );
    if (!fornecedorBate) {
      return NextResponse.json(
        { error: `OC ${numOcpDigitado} é do fornecedor ${oc.fornecedorNome || oc.fornecedorCodigo}, diferente do fornecedor do título (${existente.fornecedorNome || existente.codFor}) -- confira o número` },
        { status: 422 }
      );
    }
    numOcpCorrigido = oc.numOcp;
  }

  const atualizado = await prisma.tituloContasAPagar.update({
    where: { id: params.id },
    data: {
      revisadoStatus: parsed.data.revisadoStatus,
      revisadoObs: parsed.data.revisadoObs ?? null,
      revisadoPorNome: parsed.data.revisadoStatus ? user.name ?? "Usuário" : null,
      revisadoEm: parsed.data.revisadoStatus ? new Date() : null,
      // so' limpa a correcao manual quando o proprio PATCH mandou null/ausente
      // E o status mudou pra algo diferente de CORRIGIDO -- sair de CORRIGIDO
      // pra outro status (ex: reabrir) descarta o vinculo manual de propósito.
      numOcpCorrigido: parsed.data.revisadoStatus === "CORRIGIDO" ? numOcpCorrigido : null,
    },
  });

  // Retorno de OC: so' na transicao pra APROVADO (salvar de novo nao reenvia).
  let avisoCriadorOc: ResultadoAviso | null = null;
  if (atualizado.revisadoStatus === "APROVADO" && existente.revisadoStatus !== "APROVADO") {
    avisoCriadorOc = await avisarCriadorOc(atualizado.id, user.name ?? "Usuário");
  }

  return NextResponse.json({
    id: atualizado.id,
    revisadoStatus: atualizado.revisadoStatus,
    revisadoPorNome: atualizado.revisadoPorNome,
    revisadoEm: atualizado.revisadoEm,
    revisadoObs: atualizado.revisadoObs,
    numOcpCorrigido: atualizado.numOcpCorrigido,
    avisoCriadorOc,
  });
}
