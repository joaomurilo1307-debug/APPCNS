import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { lerArquivoRetorno, normalizarRetorno } from "@/lib/cnab240/itau/retorno";
import { OCORRENCIAS, OCORRENCIAS_POSITIVAS } from "@/lib/cnab240/itau/constantes";
import type { ItemRetorno } from "@/lib/cnab240/itau/tipos";
import { casarItemDoRetorno } from "./casarRetorno";
import { metadadosRetorno, remessasDoRetorno, type MetadadosRetorno } from "./resumoRetorno";

export function statusDoItem(item: ItemRetorno): "PAGO" | "AGENDADO" | "CANCELADO" | "REJEITADO" {
  const codigos = item.ocorrencias.map(o => o.codigo);
  if (!codigos.length) throw new Error("Pagamento sem ocorrencias.");
  const cancelamentos = ["CE", "NA", "SS", "LC"];
  const adversos = codigos.filter(c => !OCORRENCIAS_POSITIVAS.has(c));
  if (codigos.includes("00")) {
    if (adversos.length) throw new Error(`Pagamento ${item.referenciaEmpresa} traz confirmacao e erro/cancelamento juntos. Conferir no Itau.`);
    if (!item.dataEfetiva || !item.valorEfetivo || item.valorEfetivo <= 0) throw new Error(`Pagamento ${item.referenciaEmpresa} confirmado sem data/valor efetivo validos.`);
    return "PAGO";
  }
  if (adversos.some(c => !OCORRENCIAS[c] || ["DV", "EX"].includes(c))) {
    throw new Error(`Ocorrencia exige conferencia manual (${adversos.join(", ")}) no pagamento ${item.referenciaEmpresa}.`);
  }
  if (adversos.some(c => cancelamentos.includes(c))) return "CANCELADO";
  if (adversos.length) return "REJEITADO";
  return "AGENDADO";
}

export async function processarRetorno(db: PrismaClient, dados: { nomeArquivo: string; conteudo: string; userId: string }) {
  const conteudo = normalizarRetorno(dados.conteudo);
  const lido = lerArquivoRetorno(conteudo);
  const hashArquivo = createHash("sha256").update(conteudo, "ascii").digest("hex");
  // Validar todas as ocorrencias antes de gravar qualquer item.
  const estados = lido.itens.map(statusDoItem);
  return db.$transaction(async tx => {
    // Serializa imports inclusive de arquivos distintos que atingem o mesmo item.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(341240)`;
    const existente = await tx.retornoPagamentoArquivo.findFirst({ where: { OR: [{ hashArquivo }, { conteudoArquivo: conteudo }] } });
    if (existente) {
      const metadados = metadadosRetorno(existente.resultadoImportacao, existente.remessaId);
      const remessasVinculadas = await remessasDoRetorno(tx, metadados.remessaIds);
      return { retorno: existente, duplicado: true, totalLido: lido.itens.length, totalReconhecidos: existente.totalReconhecidos,
        naoReconhecidos: metadados.naoReconhecidos, resumoStatus: metadados.resumoStatus, remessasVinculadas,
        prontosParaBaixa: remessasVinculadas.reduce((s, r) => s + r.qtdProntos, 0),
      };
    }
    const remessas = new Set<string>();
    const titulosEnviados = new Set<string>();
    const titulosLiberados = new Set<string>();
    const itensAtingidos = new Set<string>();
    const naoReconhecidos: string[] = [];
    const resumoStatus: Record<string, number> = { PAGO: 0, AGENDADO: 0, CANCELADO: 0, REJEITADO: 0 };
    for (const [i, item] of lido.itens.entries()) {
      const registro = await casarItemDoRetorno(tx, item.referenciaEmpresa, item);
      if (!registro) { naoReconhecidos.push(item.referenciaEmpresa); continue; }
      if (itensAtingidos.has(registro.id)) throw new Error(`Mesmo pagamento aparece mais de uma vez no retorno (${item.referenciaEmpresa}). Conferir no Itau.`);
      itensAtingidos.add(registro.id);
      const status = estados[i];
      if (registro.status === "PAGO" && status !== "PAGO") throw new Error(`Pagamento ${item.referenciaEmpresa} ja confirmado como PAGO. Retorno antigo ou devolucao exige conferencia e eventual estorno na Senior.`);
      if (registro.status === "PAGO" && (registro.valorEfetivado !== item.valorEfetivo || registro.dataEfetivacao?.getTime() !== item.dataEfetiva?.getTime())) throw new Error(`Confirmacoes de pagamento divergentes para ${item.referenciaEmpresa}.`);
      const anteriores = registro.ocorrencias ? JSON.parse(registro.ocorrencias) : [];
      const recebidoEm = new Date().toISOString();
      await tx.remessaItemPagamento.update({ where: { id: registro.id }, data: {
        status, nossoNumero: item.nossoNumero ?? registro.nossoNumero,
        dataEfetivacao: status === "PAGO" ? item.dataEfetiva : null,
        valorEfetivado: status === "PAGO" ? item.valorEfetivo : null,
        ocorrencias: JSON.stringify([...anteriores, ...item.ocorrencias.map(o => ({ ...o, recebidoEm, hashArquivo }))]),
      } });
      resumoStatus[status]++;
      if (registro.tituloId && ["PAGO", "AGENDADO"].includes(status)) titulosEnviados.add(registro.tituloId);
      if (registro.tituloId && ["REJEITADO", "CANCELADO"].includes(status)) titulosLiberados.add(registro.tituloId);
      remessas.add(registro.remessaId);
    }
    const retorno = await tx.retornoPagamentoArquivo.create({ data: {
      hashArquivo, remessaId: remessas.size === 1 ? [...remessas][0] : null,
      nomeArquivo: dados.nomeArquivo, totalRegistros: lido.itens.length, totalReconhecidos: itensAtingidos.size,
      processadoPorId: dados.userId, conteudoArquivo: conteudo,
      resultadoImportacao: { versao: 1, remessaIds: [...remessas], naoReconhecidos, resumoStatus } satisfies MetadadosRetorno,
    } });
    await tx.tituloContasAPagar.updateMany({ where: { id: { in: [...titulosEnviados] }, OR: [{ revisadoStatus: null }, { revisadoStatus: "APROVADO" }] }, data: {
      revisadoStatus: "ENVIADO_AGUARDANDO_BAIXA", revisadoPorNome: "Retorno Itaú (automático)", revisadoEm: new Date(),
    } });
    // Uma rejeicao/cancelamento libera a revisao somente se nao houver outro
    // pagamento valido para o titulo; nunca apagar CORRIGIDO ou vinculos manuais.
    for (const tituloId of titulosLiberados) {
      const ativos = await tx.remessaItemPagamento.count({ where: { tituloId, status: { in: ["PENDENTE", "AGENDADO", "PAGO"] } } });
      if (!ativos) await tx.tituloContasAPagar.updateMany({ where: { id: tituloId, revisadoStatus: "ENVIADO_AGUARDANDO_BAIXA" }, data: { revisadoStatus: null, revisadoEm: null, revisadoPorNome: null } });
    }
    await tx.remessaPagamento.updateMany({ where: { id: { in: [...remessas] } }, data: { status: "RETORNO_PROCESSADO" } });
    const remessasVinculadas = await remessasDoRetorno(tx, [...remessas]);
    return { retorno, duplicado: false, totalLido: lido.itens.length, totalReconhecidos: itensAtingidos.size, naoReconhecidos, resumoStatus, remessasVinculadas,
      prontosParaBaixa: remessasVinculadas.reduce((s, r) => s + r.qtdProntos, 0),
    };
  }, { timeout: 60_000, maxWait: 10_000 });
}
