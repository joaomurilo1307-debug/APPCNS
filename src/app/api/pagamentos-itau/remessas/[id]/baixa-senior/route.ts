import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import {
  COD_EMP_PADRAO,
  gerarBaixaPorLoteCP,
  situacaoDoTituloNaSenior,
  type TituloParaBaixa,
} from "@/lib/senior/baixaTitulos";

// Baixa na Senior (GerarBaixaPorLoteCP) dos pagamentos que o banco confirmou
// no retorno (status PAGO). ESCREVE no contas a pagar da Senior, entao:
//  - sem "confirmar: true" so' simula (le a Senior, nao grava nada);
//  - cada titulo e' conferido AO VIVO na Senior antes de enviar: se ja estiver
//    liquidado vira JA_BAIXADO (nunca baixa duas vezes) e se o valor pago for
//    diferente do em aberto fica de fora (desconto/juros e' decisao contabil,
//    fica pra baixa manual);
//  - so' ADMIN/DIRETOR.

const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];
const TAMANHO_LOTE = 50;

const bodySchema = z.object({
  confirmar: z.boolean().optional(),
  numCcoSenior: z.string().trim().min(1).max(14).optional(),
});

type Analise = {
  itemId: string;
  referencia: string;
  numTit: string;
  fornecedor: string;
  valor: number;
  dataEfetivacao: Date | null;
  situacao: "ELEGIVEL" | "JA_BAIXADO" | "BLOQUEADO";
  motivo?: string;
  envio?: TituloParaBaixa;
};

const chaveData = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const confirmar = parsed.data.confirmar === true;

  const remessa = await prisma.remessaPagamento.findUnique({
    where: { id: params.id },
    include: {
      contaBancaria: true,
      itens: { where: { status: "PAGO" }, include: { titulo: true } },
    },
  });
  if (!remessa) return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });

  const numCco = parsed.data.numCcoSenior ?? remessa.contaBancaria.numCcoSenior ?? "";
  if (!numCco) {
    return NextResponse.json(
      { error: "Informe a conta interna da Senior (numCco, tela F600CCO) correspondente a esta conta bancária." },
      { status: 422 }
    );
  }

  const pendentes = remessa.itens.filter((i) => i.baixaSeniorStatus !== "ENVIADA" && i.baixaSeniorStatus !== "JA_BAIXADO");
  const analises: Analise[] = [];

  for (const item of pendentes) {
    const base = {
      itemId: item.id,
      referencia: item.referenciaEmpresa,
      numTit: item.titulo?.numTit ?? "—",
      fornecedor: item.titulo?.fornecedorNome ?? item.favorecidoNome,
      valor: item.valorEfetivado ?? item.valor,
      dataEfetivacao: item.dataEfetivacao,
    };
    const bloquear = (motivo: string) => analises.push({ ...base, situacao: "BLOQUEADO", motivo });

    const t = item.titulo;
    if (!t) { bloquear("Pagamento sem título vinculado no app — baixar manualmente."); continue; }
    if (!item.dataEfetivacao || !item.valorEfetivado) { bloquear("Retorno sem data/valor efetivo do pagamento."); continue; }
    if (!/^\d+$/.test(t.codFor) || !/^\d+$/.test(t.codFil)) { bloquear("Código de fornecedor/filial inválido."); continue; }

    let situacao;
    try {
      const linhas = await consultarSenior(
        `SELECT NUMTIT, CODTPT, CODFOR, SITTIT, VLRABE FROM E501TCP WHERE CODEMP = ${COD_EMP_PADRAO} AND CODFIL = ${t.codFil} ` +
          `AND CODFOR = ${t.codFor} AND NUMTIT = '${t.numTit.replace(/'/g, "''")}' AND CODTPT = '${t.tipo.replace(/'/g, "''")}'`
      );
      situacao = situacaoDoTituloNaSenior(linhas);
    } catch (e: any) {
      bloquear(`Não foi possível conferir o título na Senior agora (${String(e.message).slice(0, 120)}).`);
      continue;
    }

    if (!situacao.existe) { bloquear("Título não encontrado na Senior (empresa/filial/fornecedor/tipo)."); continue; }
    if (!situacao.aberto) {
      if (situacao.sittit === "LQ" || situacao.sittit === "AB") {
        analises.push({ ...base, situacao: "JA_BAIXADO", motivo: "A Senior já mostra este título liquidado (sem saldo em aberto)." });
      } else {
        // CA (cancelado), PE/AV/LS/LV (situacoes especiais): nao foi pago por baixa normal, nao e' pra baixar.
        bloquear(`Título em situação "${situacao.sittit}" na Senior (cancelado ou especial) — não é baixável automaticamente, conferir na Senior.`);
      }
      continue;
    }
    if (Math.abs(situacao.valorAberto - item.valorEfetivado) >= 0.005) {
      bloquear(
        `Valor pago (${item.valorEfetivado.toFixed(2)}) diferente do em aberto na Senior (${situacao.valorAberto.toFixed(2)}) — ` +
          `desconto/juros/parcial é decisão contábil, baixar manualmente.`
      );
      continue;
    }

    analises.push({
      ...base,
      situacao: "ELEGIVEL",
      envio: {
        numInt: item.referenciaEmpresa,
        codFil: Number(t.codFil),
        numTit: t.numTit,
        codTpt: t.tipo,
        codFor: Number(t.codFor),
        valor: item.valorEfetivado,
        obs: `Baixa automatica - retorno Itau SISPAG ${item.referenciaEmpresa}`,
      },
    });
  }

  const elegiveis = analises.filter((a) => a.situacao === "ELEGIVEL");
  const resumo = (a: Analise) => ({
    itemId: a.itemId,
    numTit: a.numTit,
    fornecedor: a.fornecedor,
    valor: a.valor,
    dataPagamento: a.dataEfetivacao,
    motivo: a.motivo ?? null,
  });
  const previa = {
    numCco,
    elegiveis: elegiveis.map(resumo),
    jaBaixados: analises.filter((a) => a.situacao === "JA_BAIXADO").map(resumo),
    bloqueados: analises.filter((a) => a.situacao === "BLOQUEADO").map(resumo),
    totalElegivel: elegiveis.reduce((s, a) => s + a.valor, 0),
  };

  if (!confirmar) return NextResponse.json({ simulacao: true, ...previa });

  if (numCco !== remessa.contaBancaria.numCcoSenior) {
    await prisma.contaBancaria.update({ where: { id: remessa.contaBancariaId }, data: { numCcoSenior: numCco } });
  }

  const agora = new Date();
  for (const a of analises.filter((x) => x.situacao === "JA_BAIXADO")) {
    await prisma.remessaItemPagamento.update({
      where: { id: a.itemId },
      data: { baixaSeniorStatus: "JA_BAIXADO", baixaSeniorEm: agora, baixaSeniorMsg: a.motivo, baixaSeniorPorId: user.id },
    });
  }

  // Um lote por (filial, data de baixa): a chamada tem uma data e uma filial só.
  const grupos = new Map<string, Analise[]>();
  for (const a of elegiveis) {
    const chave = `${a.envio!.codFil}|${chaveData(a.dataEfetivacao!)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }

  let enviados = 0;
  let comErro = 0;
  const erros: { numTit: string; erro: string }[] = [];

  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i += TAMANHO_LOTE) {
      const parte = grupo.slice(i, i + TAMANHO_LOTE);
      let ok = false;
      let mensagemLote = "";
      let porNumInt = new Map<string, string>();
      try {
        const r = await gerarBaixaPorLoteCP({
          codEmp: COD_EMP_PADRAO,
          codFil: parte[0].envio!.codFil,
          datBai: parte[0].dataEfetivacao!,
          numCco,
          titulos: parte.map((p) => p.envio!),
        });
        ok = r.ok;
        mensagemLote = r.erroExecucao || (r.ok ? "" : `Senior respondeu "${r.resultado || "sem resultado"}"`);
        porNumInt = new Map(r.itens.filter((x) => x.msgErr).map((x) => [x.numInt, x.msgErr]));
      } catch (e: any) {
        // Sem resposta nao quer dizer que nao gravou -- a conferencia ao vivo da
        // proxima tentativa pega "ja baixado" se a Senior tiver gravado.
        mensagemLote = `Sem resposta da Senior (${String(e.message).slice(0, 150)}). Confira na Senior antes de tentar de novo.`;
      }

      for (const a of parte) {
        const msgItem = porNumInt.get(a.referencia);
        const falhou = !ok;
        await prisma.remessaItemPagamento.update({
          where: { id: a.itemId },
          data: {
            baixaSeniorStatus: falhou ? "ERRO" : "ENVIADA",
            baixaSeniorEm: agora,
            baixaSeniorMsg: falhou ? msgItem || mensagemLote || "Erro não detalhado pela Senior" : msgItem ?? null,
            baixaSeniorPorId: user.id,
          },
        });
        if (falhou) {
          comErro += 1;
          erros.push({ numTit: a.numTit, erro: msgItem || mensagemLote || "Erro não detalhado pela Senior" });
        } else {
          enviados += 1;
        }
      }
    }
  }

  return NextResponse.json({
    simulacao: false,
    ...previa,
    enviados,
    comErro,
    erros,
    jaBaixadosAgora: previa.jaBaixados.length,
  });
}
