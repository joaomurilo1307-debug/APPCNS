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
  // PROXIMA_PROGRAMACAO (06/10/2026): "jogado" pra proxima programacao de
  // pagamento -- vai pra aba propria e deixa rastro (TituloAdiamento) da
  // programacao de onde saiu, porque o vencimento muda no Senior e o titulo
  // sumia da semana de origem sem aviso. O motivo (opcional) vai em revisadoObs.
  revisadoStatus: z
    .enum(["APROVADO", "CORRIGIDO", "SEM_OC_CONFIRMADO", "AGUARDANDO_COMPRAS", "ENVIADO_AGUARDANDO_BAIXA", "PROXIMA_PROGRAMACAO"])
    .nullable(),
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

  // Adiamento ("proxima programacao"): abre o registro na primeira vez que o
  // titulo e' jogado (guarda a programacao de ORIGEM = vencimento de agora,
  // antes de alguem mudar a data no Senior); salvar de novo so' atualiza o
  // motivo. Sair desse status (ou ser reprogramado) fecha o registro, mas ele
  // fica no historico da programacao de origem.
  let adiamento: { id: string; programacaoOrigem: Date | null; marcadoPorNome: string; marcadoEm: Date; motivo: string | null } | null = null;
  if (parsed.data.revisadoStatus === "PROXIMA_PROGRAMACAO") {
    const aberto = await prisma.tituloAdiamento.findFirst({
      where: { tituloId: existente.id, resolvidoEm: null },
      orderBy: { marcadoEm: "desc" },
    });
    const motivo = parsed.data.revisadoObs?.trim() || null;
    if (!aberto) {
      adiamento = await prisma.tituloAdiamento.create({
        data: {
          tituloId: existente.id,
          numTit: existente.numTit,
          codFor: existente.codFor,
          fornecedorNome: existente.fornecedorNome,
          valor: existente.valorAberto,
          programacaoOrigem: existente.vencimentoProgramado,
          marcadoPorNome: user.name ?? "Usuário",
          motivo,
        },
        select: { id: true, programacaoOrigem: true, marcadoPorNome: true, marcadoEm: true, motivo: true },
      });
    } else if (parsed.data.revisadoObs !== undefined) {
      adiamento = await prisma.tituloAdiamento.update({
        where: { id: aberto.id },
        data: { motivo },
        select: { id: true, programacaoOrigem: true, marcadoPorNome: true, marcadoEm: true, motivo: true },
      });
    } else {
      adiamento = aberto;
    }
  } else if (existente.revisadoStatus === "PROXIMA_PROGRAMACAO") {
    await prisma.tituloAdiamento.updateMany({
      where: { tituloId: existente.id, resolvidoEm: null },
      data: { resolvidoEm: new Date(), resolvidoComo: "REPROGRAMADO" },
    });
  }

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
    adiamento,
    avisoCriadorOc,
  });
}
