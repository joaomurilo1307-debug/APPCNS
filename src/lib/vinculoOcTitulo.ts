// Motor único de conciliação Título <-> OC (extraído de /api/titulos-pagar
// em 14/09/2026 pra ser reaproveitado também no sentido inverso -- achar
// título(s) a partir de uma OC, pro mapa da OC mostrar "gerou este título,
// pago ou não" -- pedido do João: "tudo precisa casar, se você quiser achar
// uma OC pelo título ou o título pela OC, pago ou não, tudo tem que
// aparecer". Um só motor pros dois sentidos evita as duas pontas
// divergirem com o tempo.
//
// Cruzamento com OC (regra de 30/10/2026): o vínculo automático vem só de
// USU_NUMOCP do título ou da OC gravada na NF de compra do título -- ver
// criarMotorVinculo. As funções de referência/parcela abaixo continuam
// exportadas porque o dossiê e o aviso de candidatas ainda as usam.

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
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  tipo: string;
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
    // Achado 30/09/2026: quem digita USU_NUMTIT na OC às vezes deixa a
    // parcela pela metade (ex.: "2072$" em vez de "2072$01") ao registrar
    // mais de uma referência no mesmo campo. Sem isso, "2072$" nunca bate
    // com a parcela real do título nem vira um prefixo válido (a regra de
    // parcela exige dígito depois do separador) -- a OC nunca aparece pro
    // título certo mesmo já sincronizada. Tratamos o separador solto no
    // final como se a parcela não tivesse sido informada, caindo pro
    // número-base (aditivo: só adiciona candidata, nunca remove uma já
    // válida).
    if (/[$_]$/.test(parte)) resultado.add(parte.slice(0, -1));
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

// Puras, sem estado -- extraídas do motor pra reaproveitar fora dele (ex:
// achar o candidato de uma OC específica sem rodar o motor pra todos os
// títulos). Usadas também dentro de criarMotorVinculo, mesma implementação.
export function distanciaDias(a: Date | null | undefined, b: Date | null | undefined) {
  if (!a || !b) return null;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

export function mesmoValor(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

export function dataCompativel(oc: OcParaVinculo, titulo: TituloParaVinculo) {
  const previsao = distanciaDias(oc.previsaoPagamento, titulo.vencimentoProgramado);
  const emissao = distanciaDias(oc.dataEmissao, titulo.dataEmissao);
  return (previsao !== null && previsao <= 3) || (emissao !== null && emissao <= 45);
}

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

export type VinculoSenior = { origem: string; codFil: string; codFor: string; chave: string; numOcp: string };

// Motor: recebe TODAS as OCs e os vinculos que a Senior registra (ver
// src/lib/senior/vinculosOc.ts) e devolve uma funcao que resolve o vinculo de
// QUALQUER titulo -- usado tanto pra listar titulos quanto pro mapa da OC
// (filtra o resultado por numOcp, sentido inverso).
//
// Regra (pedido 30/10/2026): o vinculo automatico vem EXCLUSIVAMENTE de
//  1) E501TCP.USU_NUMOCP do titulo, ou
//  2) OC gravada na NF de compra do titulo (E440IPC/E440ISC.NUMOCP via NUMNFC).
// Nada de referencia digitada na OC, parcela, nem fornecedor+valor+data.
export function criarMotorVinculo(ocs: OcParaVinculo[], vinculos: VinculoSenior[]) {
  const ocPorNumero = new Map<string, OcParaVinculo>();
  for (const oc of ocs) ocPorNumero.set(normalizarReferencia(oc.numOcp), oc);

  const chaveVinculo = (origem: string, codFil: string, codFor: string, chave: string) =>
    `${origem}|${normalizarReferencia(codFil)}|${normalizarReferencia(codFor)}|${normalizarReferencia(chave)}`;
  const indice = new Map<string, Set<string>>();
  for (const v of vinculos) {
    const k = chaveVinculo(v.origem, v.codFil, v.codFor, v.chave);
    (indice.get(k) ?? indice.set(k, new Set()).get(k)!).add(normalizarReferencia(v.numOcp));
  }
  const buscar = (origem: string, titulo: TituloParaVinculo, chave: string | null | undefined) =>
    referenciaPreenchida(chave) ? [...(indice.get(chaveVinculo(origem, titulo.codFil, titulo.codFor, chave!)) ?? [])] : [];

  function fornecedorCompativel(titulo: TituloParaVinculo, oc: OcParaVinculo) {
    const doTitulo = chavesFornecedor(titulo.codFor, titulo.fornecedorNome);
    const daOC = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome);
    return doTitulo.some((chave) => daOC.includes(chave));
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

  function resultadoComOC(oc: OcParaVinculo, titulo: TituloParaVinculo, motivo: string): ResultadoVinculo {
    return {
      ocRelacionada: {
        numOcp: oc.numOcp,
        situacao: oc.situacaoAtual,
        situacaoLabel: situacaoLabel(oc.situacaoAtual),
        parcela: false,
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
      motivoSemOC: detalhe || "Sem OC: o título não tem USU_NUMOCP e a NF dele não está ligada a nenhuma OC no Senior.",
      ocEsperada: true,
    };
  }

  function ocRelacionadaDe(titulo: TituloParaVinculo): ResultadoVinculo {
    if (!tituloPodeTerOC(titulo)) return semOC(titulo);

    // 1) Campo USU_NUMOCP do proprio titulo.
    const doCampo = buscar("TITULO", titulo, titulo.numTit);
    if (doCampo.length > 0) {
      if (doCampo.length > 1) return semOC(titulo, `O USU_NUMOCP do título aparece com ${doCampo.length} OCs diferentes; não vinculei nenhuma.`);
      const oc = ocPorNumero.get(doCampo[0]);
      if (!oc) return semOC(titulo, `O título informa a OC ${doCampo[0]} (USU_NUMOCP), mas essa OC não foi sincronizada para o sistema.`);
      if (!fornecedorCompativel(titulo, oc)) {
        return semOC(titulo, `Conflito: o título informa a OC ${doCampo[0]} (USU_NUMOCP), mas o fornecedor da OC não é o mesmo do título.`);
      }
      return resultadoComOC(oc, titulo, "Vínculo direto: o título informa esta OC (USU_NUMOCP).");
    }

    // 2) OC gravada na NF de compra do titulo.
    const daNf = buscar("NF", titulo, titulo.numNfc);
    if (daNf.length > 1) return semOC(titulo, `A NF ${titulo.numNfc} está ligada a ${daNf.length} OCs no Senior (${daNf.join(", ")}); não vinculei nenhuma.`);
    if (daNf.length === 1) {
      const oc = ocPorNumero.get(daNf[0]);
      if (!oc) return semOC(titulo, `A NF ${titulo.numNfc} está ligada à OC ${daNf[0]} no Senior, mas essa OC não foi sincronizada para o sistema.`);
      return resultadoComOC(oc, titulo, `Vínculo pela NF ${titulo.numNfc}: a nota está ligada a esta OC no Senior.`);
    }

    return semOC(titulo);
  }

  return { ocRelacionadaDe };
}

// Vínculo manual (01/10/2026): quando alguém revisa um título "Sem OC" e
// confirma a OC certa olhando direto o Senior -- sem NF batendo, sem
// referência cruzada, só a conferência humana mesmo -- isso tem prioridade
// sobre o motor automático acima. Nunca substitui o motor de verdade: um
// título sem correção manual continua resolvido só pelas regras de
// ocRelacionadaDe. `buscarOc` é só uma função de consulta (ex:
// `(numOcp) => mapa.get(numOcp)`) pra não precisar reconstruir os índices
// do motor só pra achar uma OC pelo número.
export function aplicarCorrecaoManual(
  titulo: { numOcpCorrigido?: string | null },
  buscarOc: (numOcp: string) => OcParaVinculo | undefined,
  automatico: ResultadoVinculo
): ResultadoVinculo {
  if (!titulo.numOcpCorrigido) return automatico;
  const oc = buscarOc(normalizarReferencia(titulo.numOcpCorrigido));
  if (!oc) return automatico; // numero digitado nao existe/nao sincronizou -- nao quebra, so' ignora
  return {
    ocRelacionada: {
      numOcp: oc.numOcp,
      situacao: oc.situacaoAtual,
      situacaoLabel: situacaoLabel(oc.situacaoAtual),
      parcela: false,
      motivo: "Vínculo manual: conferido direto no Senior e corrigido na revisão, sem precisar de NF.",
      centroCusto: oc.temRateio ? "Rateio por múltiplos centros" : oc.contratoNome || (oc.codccu ? `CC ${oc.codccu}` : null),
    },
    motivoSemOC: null,
    ocEsperada: true,
  };
}
