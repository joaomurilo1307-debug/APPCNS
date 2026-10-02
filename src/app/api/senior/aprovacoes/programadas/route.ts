import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  criarMotorVinculo,
  aplicarCorrecaoManual,
  chavesFornecedor,
  normalizarReferencia,
  mesmoValor,
  dataCompativel,
  situacaoLabel,
  type OcParaVinculo,
  type TituloParaVinculo,
} from "@/lib/vinculoOcTitulo";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

// OCs com previsão de pagamento (E420OCP.USU_DATVECT, campo que o comprador
// preenche na OC -- é o que a pasta/relatório que o time financeiro usa por
// fora provavelmente lê) num intervalo de datas, com o diagnóstico de cada
// uma: já linkada, tem candidato esperando confirmação, não tem título
// nenhum ainda, ou a OC nem terminou de aprovar. Pedido do João 01/10/2026:
// "precisamos entender como alterar essas coisas, pra deixar tudo fluido"
// depois de uma auditoria manual achar 15 OCs com título real mas vínculo
// não confirmado (10 delas também com VCTORI do título desatualizado,
// apontando setembro quando a previsão real -- USU_DATVECT -- já é outubro).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  if (!de || !ate) return NextResponse.json({ error: "Parâmetros 'de' e 'ate' (YYYY-MM-DD) são obrigatórios" }, { status: 422 });

  const inicio = new Date(`${de}T00:00:00Z`);
  const fim = new Date(`${ate}T23:59:59Z`);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return NextResponse.json({ error: "Datas inválidas" }, { status: 422 });
  }

  const [titulos, todasOcs] = await Promise.all([
    prisma.tituloContasAPagar.findMany(),
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

  const ocsProgramadas = todasOcs.filter(
    (oc) => oc.previsaoPagamento && oc.previsaoPagamento >= inicio && oc.previsaoPagamento <= fim
  );

  const motor = criarMotorVinculo(todasOcs);
  const ocPorNumero = new Map(todasOcs.map((o) => [o.numOcp, o]));

  // Índice fornecedor -> títulos, só pra esta rota (não mexe no motor
  // compartilhado): usado pra achar candidato e pra saber se o fornecedor
  // tem algum título lançado, mesmo sem bater valor/data.
  const titulosPorFornecedor = new Map<string, (typeof titulos)>();
  for (const t of titulos) {
    for (const chave of chavesFornecedor(t.codFor, t.fornecedorNome)) {
      const lista = titulosPorFornecedor.get(chave) ?? [];
      lista.push(t);
      titulosPorFornecedor.set(chave, lista);
    }
  }

  function filialCompativelOc(titulo: TituloParaVinculo, oc: OcParaVinculo) {
    const filialTitulo = normalizarReferencia(titulo.filOcp);
    const filialOC = normalizarReferencia(oc.codFil);
    return !filialTitulo || !filialOC || filialTitulo === filialOC;
  }

  const resultado = ocsProgramadas.map((ocRaw) => {
    const oc = ocRaw as OcParaVinculo;

    if (oc.situacaoAtual !== "APR") {
      return {
        numOcp: oc.numOcp,
        fornecedorNome: oc.fornecedorNome,
        valor: oc.valor,
        previsaoPagamento: oc.previsaoPagamento,
        status: "em_aprovacao" as const,
        situacao: oc.situacaoAtual,
        situacaoLabel: situacaoLabel(oc.situacaoAtual),
        detalhe: `Ainda não terminou de aprovar na Senior (${situacaoLabel(oc.situacaoAtual)}).`,
      };
    }

    const chaves = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome);
    const candidatosBrutos = chaves.flatMap((c) => titulosPorFornecedor.get(c) ?? []);
    const dedup = new Map<string, (typeof titulos)[number]>();
    for (const t of candidatosBrutos) dedup.set(t.numTit + t.codFor, t);
    const titulosDoFornecedor = [...dedup.values()].filter((t) => filialCompativelOc(t, oc));

    const vinculado = titulosDoFornecedor.find(
      (t) => aplicarCorrecaoManual(t, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t)).ocRelacionada?.numOcp === oc.numOcp
    );
    if (vinculado) {
      return {
        numOcp: oc.numOcp,
        fornecedorNome: oc.fornecedorNome,
        valor: oc.valor,
        previsaoPagamento: oc.previsaoPagamento,
        status: "vinculado" as const,
        titulo: { numTit: vinculado.numTit, valorAberto: vinculado.valorAberto, vencimentoProgramado: vinculado.vencimentoProgramado },
        detalhe: `Já vinculada ao título ${vinculado.numTit}.`,
      };
    }

    const abertos = titulosDoFornecedor.filter((t) => !t.pago);
    const candidatos = abertos.filter((t) => mesmoValor(oc.valor, t.valorOriginal) && dataCompativel(oc, t));

    if (candidatos.length === 1) {
      const t = candidatos[0];
      return {
        numOcp: oc.numOcp,
        fornecedorNome: oc.fornecedorNome,
        valor: oc.valor,
        previsaoPagamento: oc.previsaoPagamento,
        status: "candidato_pendente" as const,
        titulo: { numTit: t.numTit, valorAberto: t.valorAberto, vencimentoProgramado: t.vencimentoProgramado },
        detalhe: `Título ${t.numTit} já aberto no Senior com o mesmo valor, mas o vínculo não foi confirmado (falta a referência na OC).`,
      };
    }
    if (candidatos.length > 1) {
      return {
        numOcp: oc.numOcp,
        fornecedorNome: oc.fornecedorNome,
        valor: oc.valor,
        previsaoPagamento: oc.previsaoPagamento,
        status: "indeterminado" as const,
        detalhe: `${candidatos.length} títulos abertos desse fornecedor batem com o valor -- precisa checar manualmente qual é.`,
      };
    }
    if (abertos.length > 0) {
      return {
        numOcp: oc.numOcp,
        fornecedorNome: oc.fornecedorNome,
        valor: oc.valor,
        previsaoPagamento: oc.previsaoPagamento,
        status: "indeterminado" as const,
        detalhe: `Fornecedor tem ${abertos.length} título(s) aberto(s), mas nenhum bate com o valor da OC (R$ ${oc.valor.toFixed(2)}) -- confira manualmente a descrição/NF no Senior.`,
      };
    }
    return {
      numOcp: oc.numOcp,
      fornecedorNome: oc.fornecedorNome,
      valor: oc.valor,
      previsaoPagamento: oc.previsaoPagamento,
      status: "sem_titulo" as const,
      detalhe: "Nenhum título aberto desse fornecedor no Senior ainda -- a nota não foi lançada no Contas a Pagar.",
    };
  });

  resultado.sort((a, b) => (a.previsaoPagamento! > b.previsaoPagamento! ? 1 : -1));

  const resumo = {
    total: resultado.length,
    vinculado: resultado.filter((r) => r.status === "vinculado").length,
    candidato_pendente: resultado.filter((r) => r.status === "candidato_pendente").length,
    sem_titulo: resultado.filter((r) => r.status === "sem_titulo").length,
    em_aprovacao: resultado.filter((r) => r.status === "em_aprovacao").length,
    indeterminado: resultado.filter((r) => r.status === "indeterminado").length,
  };

  return NextResponse.json({ de, ate, resumo, ocs: resultado });
}
