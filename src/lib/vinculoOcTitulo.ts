// Motor único de conciliação Título <-> OC (extraído de /api/titulos-pagar
// em 14/09/2026 pra ser reaproveitado também no sentido inverso -- achar
// título(s) a partir de uma OC, pro mapa da OC mostrar "gerou este título,
// pago ou não" -- pedido do João: "tudo precisa casar, se você quiser achar
// uma OC pelo título ou o título pela OC, pago ou não, tudo tem que
// aparecer". Um só motor pros dois sentidos evita as duas pontas
// divergirem com o tempo.
//
// Cruzamento com OC: o vínculo só é exibido como confirmado quando existe
// uma relação identificável na origem do Senior: NUMOCP/FILOCP no título,
// USU_NUMTIT/USU_NUMNFC digitado na OC ou parcela confirmável pela
// referência-base. Fornecedor + valor + data serve apenas para explicar uma
// possível candidata; nunca cria um vínculo por si só.

export type OcParaVinculo = {
  numOcp: string;
  codFil: string | null;
  fornecedorCodigo: string;
  fornecedorNome: string | null;
  valor: number;
  dataEmissao: Date;
  situacaoAtual: string;
  usuNumTit: string | null;
  usuNumNfc: string | null;
  codccu: string | null;
  contratoNome: string | null;
  temRateio: boolean;
  previsaoPagamento: Date | null;
};

export type TituloParaVinculo = {
  numTit: string;
  codFor: string;
  fornecedorNome: string | null;
  tipo: string;
  numOcp: string | null;
  filOcp: string | null;
  numNfc: string | null;
  valorOriginal: number;
  dataEmissao: Date;
  vencimentoProgramado: Date | null;
};

export type ResultadoVinculo = {
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

export function situacaoLabel(situacao: string) {
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

// O Senior traz fornecedor e referências em formatos diferentes conforme a
// tela/rotina que gerou o registro. A normalização abaixo corrige espaços,
// acentos, caixa e zeros à esquerda sem quebrar títulos como 51841-103.
export function normalizarReferencia(valor: string | null | undefined) {
  return (valor ?? "").normalize("NFKC").replace(/ /g, " ").trim().replace(/\s+/g, " ").toUpperCase();
}

export function referenciaPreenchida(valor: string | null | undefined) {
  const texto = normalizarReferencia(valor);
  return !!texto && !/^0+$/.test(texto);
}

export function normalizarNomeFornecedor(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function variantesReferencia(valor: string | null | undefined) {
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

// Bug real achado 14/09/2026 (auditoria de consistência, "confira se tudo
// bate"): esta função tinha uma chave adicional por NOME normalizado
// (`N:...`), pensada como fallback pro caso de código de fornecedor
// divergir por formatação. Na prática, código de fornecedor está SEMPRE
// preenchido (fornecedorCodigo/codFor não são opcionais no schema) -- a
// chave por nome nunca era necessária pra isso, e criou 2 falsos positivos
// confirmados: Senior tem a MESMA empresa cadastrada sob 2 códigos de
// fornecedor diferentes em pelo menos 2 casos (712040/712116 "G C CECCON",
// 712188/712015 "ARIZONA LOGISTICA") -- e como títulos de OUTRAS empresas,
// sem relação nenhuma, coincidentemente usam referências genéricas
// ("9PL01", "01") repetidas por dezenas de fornecedores diferentes, a
// combinação (nome bate + referência genérica bate) vinculou título de uma
// empresa a OC de outra completamente diferente. Corrigido: só código
// identifica fornecedor pra fins de vínculo. Isso significa que, se o
// Senior duplicar o cadastro do mesmo fornecedor sob 2 códigos, um título
// lançado no código B não casará com uma OC do código A -- mais seguro que
// o oposto (vínculo cruzado errado entre empresas de verdade diferentes).
export function chavesFornecedor(codFor: string | null | undefined, _nome?: string | null) {
  const chaves = new Set<string>();
  const codigo = normalizarReferencia(codFor);
  if (codigo) {
    chaves.add(`C:${codigo}`);
    if (/^\d+$/.test(codigo)) chaves.add(`C:${codigo.replace(/^0+(?=\d)/, "")}`);
  }
  return [...chaves];
}

const SEPARADOR_PARCELA = /[$_](\d{1,3})$/;
export function prefixoParcela(valor: string | null | undefined) {
  const texto = normalizarReferencia(valor);
  const m = texto.match(SEPARADOR_PARCELA);
  if (!m || m.index === undefined) return null;
  const prefixo = texto.slice(0, m.index).trim();
  return prefixo || null;
}

const PADRAO_NAO_OC = /SECRETARIA DE (ESTADO|FAZENDA)|GOVERNO FEDERAL|MINISTERIO DA FAZENDA|RECEITA FEDERAL|PREFEITURA|MUNICIPIO DE|INSS\b|FGTS\b|CAIXA ECON.MICA|FOPAG|FORNECEDORES DIVERSOS|SALARIO|INPS/i;

// Exceção confirmada pelo João diretamente no Senior em 14/09/2026. Chaveia
// pelo título e pelo fornecedor, não por todos os lançamentos do mesmo
// fornecedor -- outro título só poderá ser liberado quando tiver sua
// própria prova.
const SEM_OC_CONFIRMADAS = [
  {
    numTit: "633A1",
    fornecedorPrefixo: "BEF LAVAGEM AUTOMOTIVA",
    motivo: "Sem OC confirmada no Senior: o título 633A1 da BEF foi conferido e não há OC criada para ele.",
  },
];

export function tituloPodeTerOC(titulo: TituloParaVinculo) {
  if (titulo.tipo === "PRV") return false;
  if (titulo.tipo === "IMP") return false;
  if (PADRAO_NAO_OC.test(titulo.fornecedorNome ?? "")) return false;
  if (/^FOPAG/i.test(titulo.numTit)) return false;
  return true;
}

// Motor: recebe TODAS as OCs uma vez (monta os índices) e devolve uma
// função que resolve o vínculo de QUALQUER título contra esse conjunto --
// usado tanto pra listar títulos (uma chamada por título) quanto pro mapa
// da OC (filtra o resultado por numOcp, sentido inverso).
export function criarMotorVinculo(ocs: OcParaVinculo[]) {
  function adicionarIndice(mapa: Map<string, OcParaVinculo[]>, chave: string, oc: OcParaVinculo) {
    const lista = mapa.get(chave) ?? [];
    if (!lista.some((item) => item.numOcp === oc.numOcp)) lista.push(oc);
    mapa.set(chave, lista);
  }

  const ocPorNumero = new Map<string, OcParaVinculo>();
  const ocPorReferenciaFornecedor = new Map<string, OcParaVinculo[]>();
  const ocPorPrefixoParcelaFornecedor = new Map<string, OcParaVinculo[]>();
  const ocPorBaseFornecedor = new Map<string, OcParaVinculo[]>();
  const ocPorBaseParcelaFornecedor = new Map<string, OcParaVinculo[]>();
  const ocsPorFornecedor = new Map<string, OcParaVinculo[]>();

  for (const oc of ocs) {
    ocPorNumero.set(normalizarReferencia(oc.numOcp), oc);
    const fornecedores = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome);
    for (const fornecedor of fornecedores) {
      adicionarIndice(ocsPorFornecedor, fornecedor, oc);
    }

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

  function buscarIndice(mapa: Map<string, OcParaVinculo[]>, fornecedores: string[], referencias: string[]) {
    const resultado = new Map<string, OcParaVinculo>();
    for (const fornecedor of fornecedores) {
      for (const referencia of referencias) {
        for (const oc of mapa.get(`${fornecedor}|${referencia}`) ?? []) resultado.set(oc.numOcp, oc);
      }
    }
    return [...resultado.values()];
  }

  function fornecedorCompativel(titulo: TituloParaVinculo, oc: OcParaVinculo) {
    const doTitulo = chavesFornecedor(titulo.codFor, titulo.fornecedorNome);
    const daOC = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome);
    return doTitulo.some((chave) => daOC.includes(chave));
  }

  function filialCompativel(titulo: TituloParaVinculo, oc: OcParaVinculo) {
    const filialTitulo = normalizarReferencia(titulo.filOcp);
    const filialOC = normalizarReferencia(oc.codFil);
    return !referenciaPreenchida(filialTitulo) || !referenciaPreenchida(filialOC) || filialTitulo === filialOC;
  }

  function filtrarCandidatasValidas(titulo: TituloParaVinculo, candidatas: OcParaVinculo[]) {
    return candidatas.filter((oc) => fornecedorCompativel(titulo, oc) && filialCompativel(titulo, oc));
  }

  function distanciaDias(a: Date | null | undefined, b: Date | null | undefined) {
    if (!a || !b) return null;
    return Math.abs(a.getTime() - b.getTime()) / 86400000;
  }

  function mesmoValor(a: number, b: number) {
    return Math.abs(a - b) < 0.01;
  }

  function dataCompativel(oc: OcParaVinculo, titulo: TituloParaVinculo) {
    const previsao = distanciaDias(oc.previsaoPagamento, titulo.vencimentoProgramado);
    const emissao = distanciaDias(oc.dataEmissao, titulo.dataEmissao);
    return (previsao !== null && previsao <= 3) || (emissao !== null && emissao <= 45);
  }

  // Uma referência pode aparecer em mais de uma OC (reprocessamento, compra
  // parcial ou preenchimento repetido). Só escolhemos automaticamente quando
  // outra evidência independente deixa uma única candidata. Situação APR não
  // desempata relação: uma OC aprovada não vira "a certa" só por estar verde.
  function escolherCandidata(candidatas: OcParaVinculo[], titulo: TituloParaVinculo) {
    const unicas = [...new Map(candidatas.map((oc) => [oc.numOcp, oc])).values()];
    if (unicas.length === 1) return unicas[0];

    const porValor = unicas.filter((oc) => mesmoValor(oc.valor, titulo.valorOriginal));
    if (porValor.length === 1) return porValor[0];

    const porData = unicas.filter((oc) => dataCompativel(oc, titulo));
    if (porData.length === 1) return porData[0];

    return null;
  }

  function centroCustoDaOC(oc: OcParaVinculo) {
    if (oc.temRateio) return "Rateio por múltiplos centros";
    return oc.contratoNome || (oc.codccu ? `CC ${oc.codccu}` : null);
  }

  function excecaoSemOCConfirmada(titulo: TituloParaVinculo) {
    const numTit = normalizarReferencia(titulo.numTit);
    const fornecedor = normalizarNomeFornecedor(titulo.fornecedorNome);
    return SEM_OC_CONFIRMADAS.find(
      (excecao) => numTit === excecao.numTit && fornecedor.startsWith(excecao.fornecedorPrefixo)
    );
  }

  function resultadoComOC(oc: OcParaVinculo, titulo: TituloParaVinculo, parcela: boolean, motivo: string): ResultadoVinculo {
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

  function semOC(titulo: TituloParaVinculo, detalhe?: string): ResultadoVinculo {
    const excecao = excecaoSemOCConfirmada(titulo);
    if (excecao) {
      return { ocRelacionada: null, motivoSemOC: excecao.motivo, ocEsperada: false };
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

  function ocRelacionadaDe(titulo: TituloParaVinculo): ResultadoVinculo {
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
      const candidatasParcelaMap = new Map<string, OcParaVinculo>();
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

    const fornecedorOcs = new Map<string, OcParaVinculo>();
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

  return { ocRelacionadaDe };
}
