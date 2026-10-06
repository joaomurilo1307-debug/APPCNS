import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lerArquivoRetorno } from "@/lib/cnab240/itau/retorno";
import { OCORRENCIAS_POSITIVAS } from "@/lib/cnab240/itau/constantes";
import type { ItemRetorno } from "@/lib/cnab240/itau/tipos";

const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

const bodySchema = z.object({
  nomeArquivo: z.string().min(1),
  conteudo: z.string().min(1),
});

// Ultima ocorrencia da linha decide o status -- o arquivo de retorno lista
// as ocorrencias em ordem cronologica (Nota 8), entao a mais recente e' a
// que vale.
function statusDoItem(item: ItemRetorno): "PAGO" | "AGENDADO" | "CANCELADO" | "REJEITADO" {
  const ultima = item.ocorrencias[item.ocorrencias.length - 1]?.codigo;
  if (!ultima) return "REJEITADO";
  if (ultima === "00") return "PAGO";
  if (ultima === "BD" || ultima === "AE") return "AGENDADO";
  if (ultima === "CE" || ultima === "NA") return "CANCELADO";
  if (OCORRENCIAS_POSITIVAS.has(ultima)) return "AGENDADO";
  return "REJEITADO";
}

// Remessas novas levam no "Seu Numero" o formato da Senior (0 + CODFOR + NUMTIT +
// CODTPT), que NAO e' unico: o mesmo titulo pode estar em mais de uma remessa
// (uma rejeitada, outra refeita). Entre os candidatos vale o que ainda espera o
// banco (pendente/agendado); sem nenhum, o mais recente.
async function acharItemPorSeuNumero(seuNumero: string) {
  if (!seuNumero) return null;
  const candidatos = await prisma.remessaItemPagamento.findMany({ where: { seuNumero }, orderBy: { criadoEm: "desc" } });
  return candidatos.find((c) => c.status === "PENDENTE" || c.status === "AGENDADO") ?? candidatos[0] ?? null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });

  let lido;
  try {
    lido = lerArquivoRetorno(parsed.data.conteudo);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao interpretar o arquivo de retorno" }, { status: 422 });
  }

  const remessasAtingidas = new Set<string>();
  let reconhecidos = 0;
  const naoReconhecidos: string[] = [];
  const resumoStatus: Record<string, number> = { PAGO: 0, AGENDADO: 0, CANCELADO: 0, REJEITADO: 0 };
  let prontosParaBaixa = 0;
  const titulosEnviados = new Set<string>();

  for (const item of lido.itens) {
    // 1) referencia interna (remessas antigas e titulos que nao cabem no formato da
    // Senior); 2) "Seu Numero" no formato da Senior (remessas novas).
    const registro =
      (await prisma.remessaItemPagamento.findUnique({ where: { referenciaEmpresa: item.referenciaEmpresa } })) ??
      (await acharItemPorSeuNumero(item.referenciaEmpresa));
    if (!registro) {
      naoReconhecidos.push(item.referenciaEmpresa);
      continue;
    }

    const ocorrenciasAnteriores: { codigo: string; descricao: string; recebidoEm: string }[] = registro.ocorrencias
      ? JSON.parse(registro.ocorrencias)
      : [];
    const recebidoEm = new Date().toISOString();
    const ocorrenciasNovas = item.ocorrencias.map((o) => ({ ...o, recebidoEm }));

    const novoStatus = statusDoItem(item);
    await prisma.remessaItemPagamento.update({
      where: { id: registro.id },
      data: {
        nossoNumero: item.nossoNumero ?? registro.nossoNumero,
        dataEfetivacao: item.dataEfetiva ?? registro.dataEfetivacao,
        valorEfetivado: item.valorEfetivo ?? registro.valorEfetivado,
        status: novoStatus,
        ocorrencias: JSON.stringify([...ocorrenciasAnteriores, ...ocorrenciasNovas]),
      },
    });
    resumoStatus[novoStatus] += 1;
    if (registro.tituloId && (novoStatus === "PAGO" || novoStatus === "AGENDADO")) titulosEnviados.add(registro.tituloId);
    if (novoStatus === "PAGO" && registro.tituloId && registro.baixaSeniorStatus !== "ENVIADA" && registro.baixaSeniorStatus !== "JA_BAIXADO") {
      prontosParaBaixa += 1;
    }

    remessasAtingidas.add(registro.remessaId);
    reconhecidos += 1;
  }

  const remessaIdPrincipal = remessasAtingidas.size === 1 ? [...remessasAtingidas][0] : null;

  const retorno = await prisma.retornoPagamentoArquivo.create({
    data: {
      remessaId: remessaIdPrincipal,
      nomeArquivo: parsed.data.nomeArquivo,
      totalRegistros: lido.itens.length,
      totalReconhecidos: reconhecidos,
      processadoPorId: user.id,
      conteudoArquivo: parsed.data.conteudo,
    },
  });

  // O banco confirmou/agendou: o titulo passa a "Enviado (aguarda baixa Senior)"
  // na Programacao de Pagamento (so' se ainda estava sem revisao ou APROVADO --
  // nao pisa em CORRIGIDO/SEM_OC/AGUARDANDO_COMPRAS, que guardam outra conferencia).
  // "Pago" continua vindo so' do VLRABE da Senior.
  if (titulosEnviados.size > 0) {
    await prisma.tituloContasAPagar.updateMany({
      where: { id: { in: [...titulosEnviados] }, OR: [{ revisadoStatus: null }, { revisadoStatus: "APROVADO" }] },
      data: { revisadoStatus: "ENVIADO_AGUARDANDO_BAIXA", revisadoPorNome: "Retorno Itaú (automático)", revisadoEm: new Date() },
    });
  }

  if (remessasAtingidas.size > 0) {
    await prisma.remessaPagamento.updateMany({
      where: { id: { in: [...remessasAtingidas] } },
      data: { status: "RETORNO_PROCESSADO" },
    });
  }

  return NextResponse.json({
    retorno,
    totalLido: lido.itens.length,
    totalReconhecidos: reconhecidos,
    naoReconhecidos,
    resumoStatus,
    prontosParaBaixa,
  });
}
