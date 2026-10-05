import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarIndiceDossies, type DossieParaIndice } from "@/lib/dossieTitulo";
import { chavesFornecedor } from "@/lib/vinculoOcTitulo";
import {
  aguardarPrimeiraCarga,
  carregarCatalogoFormasPagamento,
  garantirFormasPagamentoAtualizadas,
} from "@/lib/senior/formasPagamento";

// Lista os dossiês de OC recebidos da automação do n8n.
// Mesmo nível de acesso da Programação de Pagamento e das Aprovações OC.

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!PAPEIS.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Forma de pagamento (CODFPG da Senior + descricao do catalogo): o app busca em
  // segundo plano (a cada 15 min); na 1a vez espera um pouco pra abrir preenchido.
  let catalogoFpg = await carregarCatalogoFormasPagamento();
  const tarefaFpg = garantirFormasPagamentoAtualizadas();
  if (catalogoFpg.size === 0) {
    await aguardarPrimeiraCarga(true, tarefaFpg);
    catalogoFpg = await carregarCatalogoFormasPagamento();
  }

  const [dossies, ocsPagas] = await Promise.all([
    prisma.dossieOC.findMany({ orderBy: [{ geradoEm: "desc" }] }),
    prisma.aprovacaoSenior.findMany({
      where: { pago: true },
      select: {
        numOcp: true,
        codFil: true,
        fornecedorCodigo: true,
        fornecedorNome: true,
        valor: true,
        previsaoPagamento: true,
        usuNumTit: true,
        resolvidoEm: true,
        ultimaSincEm: true,
      },
    }),
  ]);

  // OC paga na Senior (sincronismo do Rito) que nunca gerou nenhum registro de
  // dossie (nem sucesso, nem erro/pendencia) -- ou seja, a automacao do n8n
  // nunca chegou a processar essa OC. Sem isso, essas OCs ficam invisiveis:
  // a tela so mostra o que o n8n decidiu reportar.
  const numOcpComDossie = new Set(dossies.map((d) => d.numOcp).filter((n): n is string => !!n));
  const semDossie = ocsPagas.filter((a) => !numOcpComDossie.has(a.numOcp));

  const publicados = dossies.filter((d) => d.status === "PUBLICADO");

  const normalizados = dossies.map((d) => ({
    id: d.id,
    numOcp: d.numOcp,
    codFil: d.codFil,
    titulos: d.titulos,
    fornecedorNome: d.fornecedorNome,
    vencimento: d.vencimento,
    valorTotal: d.valorTotal,
    status: d.status,
    motivo: d.motivo,
    origem: d.origem,
    gedDocumentId: d.gedDocumentId,
    temArquivo: !!d.arquivoPath,
    arquivoNome: d.arquivoNome,
    geradoEm: d.geradoEm,
  }));

  const sinteticos = semDossie.map((a) => ({
    id: `oc-sem-dossie-${a.numOcp}`,
    numOcp: a.numOcp,
    codFil: a.codFil ?? "",
    titulos: a.usuNumTit
      ? a.usuNumTit
          .split(/[-;,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    fornecedorNome: a.fornecedorNome,
    vencimento: a.previsaoPagamento,
    valorTotal: a.valor,
    status: "AGUARDANDO_GERACAO",
    motivo: "OC paga na Senior, mas a automação (n8n) ainda não enviou o dossiê.",
    origem: "DETECCAO_INTERNA",
    gedDocumentId: null,
    temArquivo: false,
    arquivoNome: null,
    geradoEm: a.resolvidoEm ?? a.ultimaSincEm,
  }));

  // Forma de pagamento do dossie = a(s) do(s) titulo(s) que apontam pra ele, pelo
  // MESMO casamento dossie<->titulo da Programacao de Pagamento (dossieTitulo.ts),
  // pra as duas abas nunca discordarem. Dossie com titulos de formas diferentes
  // mostra todas.
  const paraIndice: DossieParaIndice[] = [
    ...dossies.map((d) => ({
      id: d.id, numOcp: d.numOcp, codFor: d.codFor, titulos: d.titulos, status: d.status,
      motivo: d.motivo, arquivoPath: d.arquivoPath, geradoEm: d.geradoEm,
    })),
    ...semDossie.map((a, i) => ({
      id: sinteticos[i].id, numOcp: a.numOcp, codFor: a.fornecedorCodigo, titulos: sinteticos[i].titulos,
      status: "AGUARDANDO_GERACAO", motivo: null, arquivoPath: null, geradoEm: sinteticos[i].geradoEm,
    })),
  ];
  const indice = criarIndiceDossies(paraIndice);
  const titulosComForma = await prisma.tituloContasAPagar.findMany({
    where: { codFpg: { not: null } },
    select: { numTit: true, codFor: true, codFpg: true },
  });
  const formasPorDossie = new Map<string, Set<string>>();
  for (const t of titulosComForma) {
    const d = indice.dossieDoTitulo({ numTit: t.numTit, codFor: t.codFor });
    if (!d || !t.codFpg) continue;
    // O casamento so' pelo numero do titulo (fallback sem fornecedor) pode pegar o titulo de OUTRO
    // fornecedor com o mesmo numero ("3", "001"...). Pra forma de pagamento isso seria dado errado:
    // so' vale se o fornecedor bate, ou se o dossie nao tem fornecedor (registro de erro do n8n).
    if (d.codFor && !chavesFornecedor(d.codFor).some((c) => chavesFornecedor(t.codFor).includes(c))) continue;
    formasPorDossie.set(d.id, (formasPorDossie.get(d.id) ?? new Set()).add(t.codFpg));
  }
  const comForma = <T extends { id: string }>(d: T) => {
    const codigos = [...(formasPorDossie.get(d.id) ?? [])].sort((x, y) => Number(x) - Number(y));
    return {
      ...d,
      codFpg: codigos.length ? codigos.join(", ") : null,
      formaPagamento: codigos.length ? codigos.map((c) => catalogoFpg.get(c) ?? `Forma ${c}`).join(" / ") : null,
    };
  };

  const todos = [...normalizados.map(comForma), ...sinteticos.map(comForma)].sort(
    (a, b) => new Date(b.geradoEm).getTime() - new Date(a.geradoEm).getTime()
  );

  return NextResponse.json({
    dossies: todos,
    total: todos.length,
    qtdPublicados: publicados.length,
    qtdPendentes: dossies.length - publicados.length,
    qtdSemGeracao: sinteticos.length,
    ultimoRecebidoEm: dossies[0]?.geradoEm ?? null,
  });
}
