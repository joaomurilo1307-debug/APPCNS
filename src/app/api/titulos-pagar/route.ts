import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título, escopo 2026. Mesmo nível de
// acesso das Aprovações OC do Senior.
//
// Cruzamento com OC (pedido do João 14/09/2026): o vínculo só é exibido como
// confirmado quando existe uma relação identificável na origem do Senior:
// NUMOCP/FILOCP no título, USU_NUMTIT/USU_NUMNFC digitado na OC ou parcela
// confirmável pela referência-base. Fornecedor + valor + data serve apenas
// para explicar uma possível candidata; nunca cria um vínculo por si só.
function situacaoLabel(situacao: string) {
  switch (situacao) {
    case "APR":
      return "Aprovada";
    case "REP":
      return "Reprovada";
    case "CAN":
      return "Cancelada";
    case "PRE":
      return "Pré-aprovada";
    case "ANA":
    default:
      return "Em análise (pendente)";
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [titulos, ocs] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      orderBy: [{ pago: "asc" }, { vencimentoProgramado: "asc" }],
    }),
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

  type OcLinha = (typeof ocs)[number];
  type TituloLinha = (typeof titulos)[number];

  // O Senior traz fornecedor e referências em formatos diferentes conforme a
  // tela/rotina que gerou o registro. A normalização abaixo corrige espaços,
  // acentos, caixa e zeros à esquerda sem quebrar títulos como 51841-103.
  function normalizarReferencia(valor: string | null | undefined) {
    return (valor ?? "").normalize("NFKC").replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ").toUpperCase();
  }

  function referenciaPreenchida(valor: string | null | undefined) {
    const texto = normalizarReferencia(valor);
    return !!texto && !/^0+$/.test(texto);
  }

  function normalizarNomeFornecedor(valor: string | null | undefined) {
    return (valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function variantesReferencia(valor: string | null | undefined) {
    const texto = normalizarReferencia(valor);
    if (!referenciaPreenchida(texto)) return [];
    const partes = new Set<string>([texto]);
    // Não dividir por hífen sem espaços, cifrão ou sublinhado: eles fazem
    // parte de muitos NUMTIT/parcela reais. Hífen com espaços e os demais
    // separadores são usados quando o comprador registra mais de uma
    // referência no mesmo campo.
    for (const bloco of texto.split(/[\n\r;,|/]+|\s+-\s+/)) {
      const parte = normalizarReferencia(bloco);
      if (!referenciaPreenchida(parte)) continue;
      partes.add(parte);
      for (const palavra of parte.split(/\s+/)) {
        if (palavra.length >= 2) partes.add(palavra);
      }
    }

    const resultado = new Set<string>();
    for (const parte of partes) {
      resultado.add(parte);
      if (/^\d+$/.test(parte)) resultado.add(parte.replace(/^0+(?=\d)/, ""));
    }
    return [...resultado];
  }

  function chavesFornecedor(codFor: string | null | undefined, nome: string | null | undefined) {
    const chaves = new Set<string>();
    const codigo = normalizarReferencia(codFor);
    if (codigo) {
      chaves.add(`C:${codigo}`);
      if (/^\d+$/.test(codigo)) chaves.add(`C:${codigo.replace(/^0+(?=\d)/, "")}`);
    }
    const nomeNormalizado = normalizarNomeFornecedor(nome);
    if (nomeNormalizado) chaves.add(`N:${nomeNormalizado}`);
    return [...chaves];
  }

  const SEPARADOR_PARCELA = /[$_](\d{1,3})$/;
  function prefixoParcela(valor: string | null | undefined) {
    const texto = normalizarReferencia(valor);
    const m = texto.match(SEPARADOR_PARCELA);
    if (!m || m.index === undefined) return null;
    const prefixo = texto.slice(0, m.index).trim();
    return prefixo || null;
  }

  function adicionarIndice(mapa: Map<string, OcLinha[]>, chave: string, oc: OcLinha) {
    const lista = mapa.get(chave) ?? [];
    if (!lista.some((item) => item.numOcp === oc.numOcp)) lista.push(oc);
    mapa.set(chave, lista);
  }

  const ocPorNumero = new Map<string, OcLinha>();
  const ocPorReferenciaFornecedor = new Map<string, OcLinha[]>();
  const ocPorPrefixoParcelaFornecedor = new Map<string, OcLinha[]>();
  const ocPorBaseFornecedor = new Map<string, OcLinha[]>();
  const ocPorBaseParcelaFornecedor = new Map<string, OcLinha[]>();
  const ocsPorFornecedor = new Map<string, OcLinha[]>();

  for (const oc of ocs) {
    ocPorNumero.set(normalizarReferencia(oc.numOcp), oc);
    const fornecedores = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome);
    for (const fornecedor of fornecedores) {
      adicionarIndice(ocsPorFornecedor, fornecedor, oc);
    }

    // USU_NUMNFC era ignorado pelo cruzamento. Para títulos NFC/NFS ele pode
    // ser justamente a única referência que o comprador preencheu na OC.
    for (const campo of [oc.usuNumTit, oc.usuNumNfc]) {
      for (const referencia of variantesReferencia(campo)) {
        for (const fornecedor of fornecedores) {
          adicionarIndice(ocPorReferenciaFornecedor, `${fornecedor}|${referencia}`, oc);
        }
        const prefixo = prefixoParcela(referencia);
        const bases = prefixo ? variantesReferencia(prefixo) : [referencia];
        for (const fornecedor of fornecedores) {
          for (const base of bases) adicionarIndice(ocPorBaseFornecedor, `${fornecedor}|${base}`, oc);
          if (!prefixo) continue;
          for (const base of bases) {
            adicionarIndice(ocPorPrefixoParcelaFornecedor, `${fornecedor}|${base}`, oc);
            adicionarIndice(ocPorBaseParcelaFornecedor, `${fornecedor}|${base}`, oc);
          }
        }
      }
    }
  }

  function buscarIndice(mapa: Map<string, OcLinha[]>, fornecedores: string[], referencias: string[]) {
    const resultado = new Map<string, OcLinha>();
    for (const fornecedor of fornecedores) {
      for (const referencia of referencias) {
        for (const oc of mapa.get(`${fornecedor}|${referencia}`) ?? []) resultado.set(oc.numOcp, oc);
      }
    }
    return [...resultado.values()];
  }

  function fornecedorCompativel(titulo: TituloLinha, oc: OcLinha) {
    const doTitulo = chavesFornecedor(titulo.codFor, titulo.fornecedorNome);
    const daOC = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome);
    return doTitulo.some((chave) => daOC.includes(chave));
  }

  function filialCompativel(titulo: TituloLinha, oc: OcLinha) {
    const filialTitulo = normalizarReferencia(titulo.filOcp);
    const filialOC = normalizarReferencia(oc.codFil);
    // Se uma das fontes ainda não trouxer a filial, não transformamos a
    // ausência desse campo em falso negativo. Quando as duas trazem, a
    // filial passa a ser parte obrigatória da relação.
    return !referenciaPreenchida(filialTitulo) || !referenciaPreenchida(filialOC) || filialTitulo === filialOC;
  }

  function filtrarCandidatasValidas(titulo: TituloLinha, candidatas: OcLinha[]) {
    return candidatas.filter((oc) => fornecedorCompativel(titulo, oc) && filialCompativel(titulo, oc));
  }

  function distanciaDias(a: Date | null | undefined, b: Date | null | undefined) {
    if (!a || !b) return null;
    return Math.abs(a.getTime() - b.getTime()) / 86400000;
  }

  function mesmoValor(a: number, b: number) {
    return Math.abs(a - b) < 0.01;
  }

  function dataCompativel(oc: OcLinha, titulo: TituloLinha) {
    const previsao = distanciaDias(oc.previsaoPagamento, titulo.vencimentoProgramado);
    const emissao = distanciaDias(oc.dataEmissao, titulo.dataEmissao);
    return (previsao !== null && previsao <= 3) || (emissao !== null && emissao <= 45);
  }

  // Uma referência pode aparecer em mais de uma OC (reprocessamento, compra
  // parcial ou preenchimento repetido). Só escolhemos automaticamente quando
  // outra evidência independente deixa uma única candidata. Situação APR não
  // desempata relação: uma OC aprovada não vira "a certa" só por estar verde.
  function escolherCandidata(candidatas: OcLinha[], titulo: TituloLinha) {
    const unicas = [...new Map(candidatas.map((oc) => [oc.numOcp, oc])).values()];
    if (unicas.length === 1) return unicas[0];

    const porValor = unicas.filter((oc) => mesmoValor(oc.valor, titulo.valorOriginal));
    if (porValor.length === 1) return porValor[0];

    const porData = unicas.filter((oc) => dataCompativel(oc, titulo));
    if (porData.length === 1) return porData[0];

    return null;
  }

  function centroCustoDaOC(oc: OcLinha) {
    if (oc.temRateio) return "Rateio por múltiplos centros";
    return oc.contratoNome || (oc.codccu ? `CC ${oc.codccu}` : null);
  }

  const PADRAO_NAO_OC = /SECRETARIA DE (ESTADO|FAZENDA)|GOVERNO FEDERAL|MINISTERIO DA FAZENDA|RECEITA FEDERAL|PREFEITURA|MUNICIPIO DE|INSS\b|FGTS\b|CAIXA ECON.MICA|FOPAG|FORNECEDORES DIVERSOS|SALARIO|INPS/i;

  // Exceção confirmada pelo João diretamente no Senior em 14/09/2026.
  // Chaveia pelo título e pelo fornecedor, não por todos os lançamentos da
  // BEF: outro título só poderá ser liberado quando tiver sua própria prova.
  const SEM_OC_CONFIRMADAS = [
    {
      numTit: "633A1",
      fornecedorPrefixo: "BEF LAVAGEM AUTOMOTIVA",
      motivo: "Sem OC confirmada no Senior: o título 633A1 da BEF foi conferido e não há OC criada para ele.",
    },
  ];

  function excecaoSemOCConfirmada(titulo: TituloLinha) {
    const numTit = normalizarReferencia(titulo.numTit);
    const fornecedor = normalizarNomeFornecedor(titulo.fornecedorNome);
    return SEM_OC_CONFIRMADAS.find(
      (excecao) => numTit === excecao.numTit && fornecedor.startsWith(excecao.fornecedorPrefixo)
    );
  }

  function tituloPodeTerOC(titulo: TituloLinha) {
    if (titulo.tipo === "PRV") return false;
    if (titulo.tipo === "IMP") return false;
    if (PADRAO_NAO_OC.test(titulo.fornecedorNome ?? "")) return false;
    if (/^FOPAG/i.test(titulo.numTit)) return false;
    return true;
  }

  type ResultadoVinculo = {
    ocRelacionada: {
      numOcp: string;
      situacao: string;
      situacaoLabel: string;
      parcela: boolean;
      motivo: string;
      centroCusto?: string | null;
    } | null;
    motivoSemOC: string | null;
    ocEsperada: boolean;
  };

  function resultadoComOC(oc: OcLinha, titulo: TituloLinha, parcela: boolean, motivo: string): ResultadoVinculo {
    return {
      ocRelacionada: {
        numOcp: oc.numOcp,
        situacao: oc.situacaoAtual,
        situacaoLabel: situacaoLabel(oc.situacaoAtual),
        parcela,
        motivo,
        centroCusto: centroCustoDaOC(oc),
      },
      motivoSemOC: null,
      ocEsperada: tituloPodeTerOC(titulo),
    };
  }

  function semOC(titulo: TituloLinha, detalhe?: string): ResultadoVinculo {
    const excecao = excecaoSemOCConfirmada(titulo);
    if (excecao) {
      return {
        ocRelacionada: null,
        motivoSemOC: excecao.motivo,
        ocEsperada: false,
      };
    }
    if (!tituloPodeTerOC(titulo)) {
      if (titulo.tipo === "PRV") {
        return {
          ocRelacionada: null,
          motivoSemOC: "Título tipo PRV (provisão/previsão): não há uma OC real esperada para este lançamento.",
          ocEsperada: false,
        };
      }
      return {
        ocRelacionada: null,
        motivoSemOC: "Lançamento sem OC por natureza (imposto, governo, folha ou fornecedor genérico).",
        ocEsperada: false,
      };
    }
    return {
      ocRelacionada: null,
      motivoSemOC: detalhe || "Não foi possível identificar a OC. Verifique a referência do título/NF na própria OC e o histórico sincronizado.",
      ocEsperada: true,
    };
  }

  function ocRelacionadaDe(titulo: TituloLinha): ResultadoVinculo {
    if (!tituloPodeTerOC(titulo)) return semOC(titulo);

    const fornecedores = chavesFornecedor(titulo.codFor, titulo.fornecedorNome);
    const referenciasTitulo = [
      ...new Set([...variantesReferencia(titulo.numTit), ...variantesReferencia(titulo.numNfc)]),
    ];

    // 1) Se a origem gravou NUMOCP no título, esse é o vínculo mais forte.
    if (referenciaPreenchida(titulo.numOcp)) {
      const direta = ocPorNumero.get(normalizarReferencia(titulo.numOcp));
      if (!direta) {
        return semOC(titulo, `O título informa a OC ${titulo.numOcp}, mas essa OC não foi sincronizada para o sistema.`);
      }
      if (!fornecedorCompativel(titulo, direta)) {
        return semOC(titulo, `Conflito: o título informa a OC ${titulo.numOcp}, mas o fornecedor da OC não é o mesmo do título.`);
      }
      if (!filialCompativel(titulo, direta)) {
        return semOC(titulo, `Conflito: o título informa a OC ${titulo.numOcp}, mas a filial da OC não é a mesma do título.`);
      }
      return resultadoComOC(direta, titulo, false, "Vínculo direto: o título informa esta OC.");
    }

    // 2) Referência exata em qualquer campo de origem: número do título ou NF.
    const exatas = filtrarCandidatasValidas(titulo, buscarIndice(ocPorReferenciaFornecedor, fornecedores, referenciasTitulo));
    if (exatas.length > 0) {
      const escolhida = escolherCandidata(exatas, titulo);
      if (escolhida) {
        return resultadoComOC(escolhida, titulo, false, "Vínculo exato: a OC referencia o número do título/NF e o fornecedor.");
      }
      return semOC(titulo, `A referência do título/NF aparece em ${exatas.length} OCs; não vinculei nenhuma sem a filial, valor ou data confirmar a OC certa.`);
    }

    // 3) Parcelas: o comprador costuma informar $01/_01 na OC e o contas a
    // pagar recebe $02, $03... Como o valor de cada parcela pode ser diferente
    // do total da OC, o número-base é a evidência principal. Se houver uma
    // única OC para o número-base, ela é vinculada mesmo com valor diferente.
    const prefixo = prefixoParcela(titulo.numTit);
    if (prefixo) {
      const candidatasParcelaMap = new Map<string, OcLinha>();
      for (const oc of [
        ...buscarIndice(ocPorPrefixoParcelaFornecedor, fornecedores, variantesReferencia(prefixo)),
        ...buscarIndice(ocPorBaseFornecedor, fornecedores, variantesReferencia(prefixo)),
      ]) {
        if (fornecedorCompativel(titulo, oc) && filialCompativel(titulo, oc)) candidatasParcelaMap.set(oc.numOcp, oc);
      }
      const candidatasParcela = [...candidatasParcelaMap.values()];
      if (candidatasParcela.length > 0) {
        const escolhida = escolherCandidata(candidatasParcela, titulo);
        if (!escolhida) {
          return semOC(titulo, `O número-base da parcela aparece em ${candidatasParcela.length} OCs; falta a referência completa para escolher a certa.`);
        }
        const motivo = mesmoValor(escolhida.valor, titulo.valorOriginal)
          ? "Vínculo por parcela: fornecedor, número-base e valor conferem."
          : "Vínculo por parcela: fornecedor e número-base conferem; o valor é o da parcela, não o total da OC.";
        return resultadoComOC(escolhida, titulo, true, motivo);
      }
    }

    // 4) O título pode não ter sufixo, enquanto a OC registra a primeira
    // parcela. Procuramos a mesma base somente entre referências parceladas.
    const basesParceladas = filtrarCandidatasValidas(titulo, buscarIndice(ocPorBaseParcelaFornecedor, fornecedores, referenciasTitulo));
    if (basesParceladas.length > 0) {
      const escolhida = escolherCandidata(basesParceladas, titulo);
      if (escolhida) return resultadoComOC(escolhida, titulo, true, "Vínculo por número-base: a OC registra a parcela desta NF.");
      return semOC(titulo, `O número-base aparece em ${basesParceladas.length} OCs; falta a referência completa para escolher a certa.`);
    }

    const fornecedorOcs = new Map<string, OcLinha>();
    for (const fornecedor of fornecedores) {
      for (const oc of ocsPorFornecedor.get(fornecedor) ?? []) fornecedorOcs.set(oc.numOcp, oc);
    }
    const todasDoFornecedor = filtrarCandidatasValidas(titulo, [...fornecedorOcs.values()]);

    // 5) Fornecedor + valor + data não é uma relação Senior. Mantemos a
    // análise apenas para explicar a pendência e orientar o backfill da
    // referência correta; não transformamos a candidata em OC vinculada.
    const porValorEData = todasDoFornecedor.filter((oc) => {
      if (!mesmoValor(oc.valor, titulo.valorOriginal)) return false;
      return dataCompativel(oc, titulo);
    });

    if (todasDoFornecedor.length === 0) {
      return semOC(titulo, "Não há OC sincronizada para este fornecedor. Verifique o histórico/backfill do Senior.");
    }
    if (porValorEData.length > 1) {
      return semOC(titulo, `Há ${porValorEData.length} OCs com fornecedor, valor e data compatíveis, mas isso não prova a relação; falta a referência do título/NF.`);
    }
    if (porValorEData.length === 1) {
      return semOC(titulo, `Há uma OC candidata (${porValorEData[0].numOcp}) com fornecedor, valor e data compatíveis, mas não a marquei como vínculo sem a referência do título/NF.`);
    }
    const mesmoValorFornecedor = todasDoFornecedor.filter((oc) => mesmoValor(oc.valor, titulo.valorOriginal));
    if (mesmoValorFornecedor.length > 0) {
      return semOC(titulo, `Existe(m) ${mesmoValorFornecedor.length} OC(s) com fornecedor e valor compatíveis, mas falta a referência do título/NF para provar qual é a certa.`);
    }
    return semOC(titulo, "Há OCs deste fornecedor, mas nenhuma referência do título/NF, parcela ou valor/data permitiu identificar a OC correta.");
  }

  const totalAberto = titulos.filter((t) => !t.pago).reduce((s, t) => s + t.valorAberto, 0);
  const qtdAberto = titulos.filter((t) => !t.pago).length;
  const qtdPagos = titulos.filter((t) => t.pago).length;
  const totalPago = titulos.filter((t) => t.pago).reduce((s, t) => s + t.valorOriginal, 0);

  return NextResponse.json({
    titulos: titulos.map((t) => {
      const vinculo = ocRelacionadaDe(t);
      return {
        numTit: t.numTit,
        codFil: t.codFil,
        fornecedorNome: t.fornecedorNome ?? `código ${t.codFor}`,
        tipo: t.tipo,
        situacao: t.situacao,
        pago: t.pago,
        dataEmissao: t.dataEmissao,
        vencimentoOriginal: t.vencimentoOriginal,
        vencimentoProgramado: t.vencimentoProgramado,
        valorOriginal: t.valorOriginal,
        valorAberto: t.valorAberto,
        dataPagamento: t.dataPagamento,
        ccuNome: t.ccuNome ?? t.codccu,
        ocRelacionada: vinculo.ocRelacionada,
        motivoSemOC: vinculo.motivoSemOC,
        ocEsperada: vinculo.ocEsperada,
      };
    }),
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    totalTitulos: titulos.length,
  });
}
