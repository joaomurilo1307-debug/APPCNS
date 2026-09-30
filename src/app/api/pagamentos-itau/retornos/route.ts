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

  for (const item of lido.itens) {
    const registro = await prisma.remessaItemPagamento.findUnique({ where: { referenciaEmpresa: item.referenciaEmpresa } });
    if (!registro) {
      naoReconhecidos.push(item.referenciaEmpresa);
      continue;
    }

    const ocorrenciasAnteriores: { codigo: string; descricao: string; recebidoEm: string }[] = registro.ocorrencias
      ? JSON.parse(registro.ocorrencias)
      : [];
    const recebidoEm = new Date().toISOString();
    const ocorrenciasNovas = item.ocorrencias.map((o) => ({ ...o, recebidoEm }));

    await prisma.remessaItemPagamento.update({
      where: { id: registro.id },
      data: {
        nossoNumero: item.nossoNumero ?? registro.nossoNumero,
        dataEfetivacao: item.dataEfetiva ?? registro.dataEfetivacao,
        valorEfetivado: item.valorEfetivo ?? registro.valorEfetivado,
        status: statusDoItem(item),
        ocorrencias: JSON.stringify([...ocorrenciasAnteriores, ...ocorrenciasNovas]),
      },
    });

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
    },
  });

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
  });
}
