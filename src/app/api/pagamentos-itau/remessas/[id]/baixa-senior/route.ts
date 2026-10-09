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
import { erroDoItemBaixa, reservarItemBaixa } from "@/lib/senior/controleBaixa";
import { registrarBaixaConferida } from "@/lib/senior/registrarBaixaConferida";

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
  situacaoSenior?: ReturnType<typeof situacaoDoTituloNaSenior>;
};

const chaveData = (d: Date) => d.toISOString().slice(0, 10);
const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

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

  // Confere na Senior (E600CCO / F600CCO) que a conta interna existe, esta ativa e e'
  // MESMO o banco/agencia/conta desta remessa -- evita baixar na conta errada
  // (ex.: "CONSOMINAS GAR" no lugar de "341") por numero digitado errado.
  let contaSenior: { descricao: string; banco: string; agencia: string; conta: string };
  try {
    const linhas = await consultarSenior(
      `SELECT NUMCCO, DESCCO, CODBAN, CODAGE, NUMCTA, SITCCO FROM E600CCO WHERE CODEMP = ${COD_EMP_PADRAO} AND NUMCCO = '${numCco.replace(/'/g, "''")}'`
    );
    const l = linhas[0];
    if (!l || linhas.length !== 1) {
      return NextResponse.json({ error: `A conta interna "${numCco}" não existe na Senior (F600CCO). Confira o código.` }, { status: 422 });
    }
    if (l.SITCCO !== "A") {
      return NextResponse.json({ error: `A conta interna "${numCco}" (${l.DESCCO}) não está ativa na Senior.` }, { status: 422 });
    }
    const c = remessa.contaBancaria;
    const contaOk = [soDigitos(c.conta), soDigitos(c.conta) + soDigitos(c.dac)].includes(soDigitos(l.NUMCTA));
    if (soDigitos(l.CODBAN) !== soDigitos(c.banco) || soDigitos(l.CODAGE) !== soDigitos(c.agencia) || !contaOk) {
      return NextResponse.json(
        {
          error:
            `A conta interna "${numCco}" (${l.DESCCO}: banco ${l.CODBAN}, ag ${l.CODAGE}, cc ${l.NUMCTA}) não corresponde à conta bancária desta remessa ` +
            `(banco ${c.banco}, ag ${c.agencia}, cc ${c.conta}-${c.dac}). Informe a conta interna correta.`,
        },
        { status: 422 }
      );
    }
    contaSenior = { descricao: l.DESCCO, banco: l.CODBAN, agencia: l.CODAGE, conta: l.NUMCTA };
  } catch (e: any) {
    return NextResponse.json({ error: `Não foi possível conferir a conta interna na Senior agora (${String(e.message).slice(0, 150)}).` }, { status: 502 });
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
    if (![t.codFor, t.codFil].every(c => /^\d+$/.test(c) && Number.isSafeInteger(Number(c)) && Number(c) > 0 && Number(c) <= 2147483647)) { bloquear("Código de fornecedor/filial inválido."); continue; }
    if (!t.numTit.trim() || t.numTit.length > 15 || !t.tipo.trim() || t.tipo.length > 3 || item.referenciaEmpresa.length > 100) {
      bloquear("Chave do título excede o contrato da Sênior. Confira o vínculo antes de enviar."); continue;
    }

    let situacao;
    try {
      const linhas = await consultarSenior(
        `SELECT NUMTIT, CODTPT, CODFOR, SITTIT, VLRABE, ULTPGT FROM E501TCP WHERE CODEMP = ${COD_EMP_PADRAO} AND CODFIL = ${t.codFil} ` +
          `AND CODFOR = ${t.codFor} AND NUMTIT = '${t.numTit.replace(/'/g, "''")}' AND CODTPT = '${t.tipo.replace(/'/g, "''")}'`
      );
      situacao = situacaoDoTituloNaSenior(linhas);
    } catch (e: any) {
      bloquear(`Não foi possível conferir o título na Senior agora (${String(e.message).slice(0, 120)}).`);
      continue;
    }

    if (!situacao.existe) { bloquear("Título não encontrado na Senior (empresa/filial/fornecedor/tipo)."); continue; }
    if (!situacao.aberto) {
      if (["LQ", "AB"].includes(situacao.sittit) && situacao.valorAberto === 0) {
        analises.push({ ...base, situacao: "JA_BAIXADO", situacaoSenior: situacao, motivo: "A Senior já mostra este título liquidado (sem saldo em aberto)." });
      } else {
        // CA (cancelado), PE/AV/LS/LV (situacoes especiais): nao foi pago por baixa normal, nao e' pra baixar.
        bloquear(`Título em situação "${situacao.sittit}" na Senior (cancelado ou especial) — não é baixável automaticamente, conferir na Senior.`);
      }
      continue;
    }
    if (["EM_PROCESSAMENTO", "INDETERMINADO"].includes(item.baixaSeniorStatus ?? "")) {
      bloquear("Baixa em processamento ou sem confirmacao conclusiva. Confira o titulo e a Tesouraria na Senior antes de liberar uma nova tentativa."); continue;
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
    contaSenior,
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
  let titulosAtualizados = 0;
  for (const a of analises.filter((x) => x.situacao === "JA_BAIXADO")) {
    titulosAtualizados += await registrarBaixaConferida(prisma, {
      itemId: a.itemId, status: "JA_BAIXADO", mensagem: a.motivo!, userId: user.id, situacao: a.situacaoSenior!,
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
      const parte: Analise[] = [];
      for (const a of grupo.slice(i, i + TAMANHO_LOTE)) {
        if (await reservarItemBaixa(prisma, a.itemId, user.id)) parte.push(a);
        else {
          comErro++;
          erros.push({ numTit: a.numTit, erro: "Outro envio esta em processamento ou o item ja foi tratado. Atualize a previa." });
        }
      }
      if (!parte.length) continue;
      let ok = false;
      let respostaConclusiva = false;
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
        respostaConclusiva = r.httpOk !== false && (r.ok || r.resultado.toUpperCase() === "ERRO");
        mensagemLote = r.erroExecucao || (r.ok ? "" : `Senior respondeu "${r.resultado || "sem resultado"}"`);
        porNumInt = new Map(parte.map(a => [a.referencia, erroDoItemBaixa(r, a.referencia) ?? ""]));
      } catch (e: any) {
        // Sem resposta nao quer dizer que nao gravou -- a conferencia ao vivo da
        // proxima tentativa pega "ja baixado" se a Senior tiver gravado.
        mensagemLote = `Sem resposta da Senior (${String(e.message).slice(0, 150)}). Confira na Senior antes de tentar de novo.`;
      }

      for (const a of parte) {
        const msgItem = porNumInt.get(a.referencia);
        let falhou = !ok || !!msgItem;
        let mensagemConferencia = "";
        let indeterminado = !respostaConclusiva;
        let liquidacaoConferida: ReturnType<typeof situacaoDoTituloNaSenior> | null = null;
        if (!falhou) {
          // OK no SOAP e aceite da operacao; conferir a liquidacao antes de
          // registrar a baixa como concluida no app.
          try {
            const t = a.envio!;
            const s = situacaoDoTituloNaSenior(await consultarSenior(
              `SELECT NUMTIT, CODTPT, CODFOR, SITTIT, VLRABE, ULTPGT FROM E501TCP WHERE CODEMP = ${COD_EMP_PADRAO} AND CODFIL = ${t.codFil} ` +
              `AND CODFOR = ${t.codFor} AND NUMTIT = '${t.numTit.replace(/'/g, "''")}' AND CODTPT = '${t.codTpt.replace(/'/g, "''")}'`
            ));
            if (!s.existe || s.valorAberto !== 0 || !["LQ", "AB"].includes(s.sittit)) {
              falhou = true; indeterminado = true;
              mensagemConferencia = "Senior respondeu OK, mas a liquidacao nao foi confirmada na leitura posterior. Conferir titulo e Tesouraria antes de repetir.";
            } else liquidacaoConferida = s;
          } catch {
            falhou = true; indeterminado = true;
            mensagemConferencia = "Senior respondeu OK, mas a conferencia posterior falhou. Conferir titulo e Tesouraria antes de repetir.";
          }
        }
        if (falhou) await prisma.remessaItemPagamento.update({
          where: { id: a.itemId },
          data: {
            baixaSeniorStatus: indeterminado ? "INDETERMINADO" : "ERRO",
            baixaSeniorEm: agora,
            baixaSeniorMsg: mensagemConferencia || msgItem || mensagemLote || "Erro não detalhado pela Senior",
            baixaSeniorPorId: user.id,
          },
        });
        if (falhou) {
          comErro += 1;
          erros.push({ numTit: a.numTit, erro: mensagemConferencia || msgItem || mensagemLote || "Erro não detalhado pela Senior" });
        } else {
          titulosAtualizados += await registrarBaixaConferida(prisma, {
            itemId: a.itemId, status: "ENVIADA", mensagem: "Senior respondeu OK e a liquidacao foi conferida (saldo zero).", userId: user.id, situacao: liquidacaoConferida!,
          });
          enviados += 1;
        }
      }
    }
  }

  // Limpa marcas antigas dos itens ja concluidos. Novas liquidacoes atualizaram
  // item e programacao atomicamente apos conferencia efetiva na Senior.
  const baixados = await prisma.remessaItemPagamento.findMany({
    where: { remessaId: remessa.id, baixaSeniorStatus: { in: ["ENVIADA", "JA_BAIXADO"] }, tituloId: { not: null } },
    select: { tituloId: true },
  });
  if (baixados.length > 0) {
    await prisma.tituloContasAPagar.updateMany({
      where: { id: { in: baixados.map((b) => b.tituloId!) }, revisadoStatus: "ENVIADO_AGUARDANDO_BAIXA" },
      data: { revisadoStatus: null, revisadoPorNome: null, revisadoEm: null },
    });
  }

  return NextResponse.json({
    simulacao: false,
    ...previa,
    enviados,
    comErro,
    erros,
    jaBaixadosAgora: previa.jaBaixados.length,
    titulosAtualizados,
  });
}
