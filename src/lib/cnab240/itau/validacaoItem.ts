// Validacao de UM item de remessa SISPAG, antes de gerar o arquivo. Mesmas
// regras no navegador (carrinho de Pagamentos Itau, pra marcar o campo errado
// de cada item na hora) e no servidor (rota POST /remessas, a validacao que
// vale de verdade) -- por isso e' uma funcao pura, sem dependencia de React
// nem de Prisma.
//
// Pedido do Joao (06/10/2026): "toda vez da erro, nao gera a remessa, nao avisa
// o motivo nem em quais titulos". Antes a falha voltava como "Dados invalidos"
// ou como a mensagem crua de uma excecao do CNAB, sem dizer qual titulo.
//
// "erro" = a remessa nao pode ser gerada com isso (o arquivo sai invalido ou o
// banco recusa o lote inteiro). "aviso" = pode gerar, mas o banco provavelmente
// vai rejeitar aquele pagamento ou o dado parece digitado errado.

import { arrecadacaoParaCodigoBarras, linhaDigitavelParaCodigoBarras, valorDaArrecadacao } from "./codigoBarras";
import { FORMA_PAGAMENTO, TIPO_CHAVE_PIX, formaSoAgencia, formaSoItau, segmentoDaForma } from "./constantes";
import { lerPixCopiaECola } from "./pixQrCode";
import { totalDoTributo } from "./remessa";
import type { DadosTributo } from "./tipos";
import { identificacaoBeneficiarioBoleto } from "../../pagamentos/beneficiarioBoleto";

export type GravidadeProblema = "erro" | "aviso";

export type ProblemaItem = {
  campo: CampoItem;
  rotulo: string;
  mensagem: string;
  gravidade: GravidadeProblema;
};

export type CampoItem =
  | "titulo"
  | "arquivo"
  | "favorecidoNome"
  | "favorecidoDocumento"
  | "bancoFavorecido"
  | "agenciaFavorecido"
  | "contaFavorecido"
  | "dacFavorecido"
  | "codigoBarras"
  | "chavePix"
  | "valor"
  | "dataPagamento"
  | "formaPagamento"
  | "pixQrCode"
  | "nfLiquidacao"
  | "dadosTributo";

export type ItemParaValidar = {
  segmento?: string;
  formaPagamento?: string;
  favorecidoNome?: string;
  favorecidoTipoDoc?: string;
  favorecidoDocumento?: string;
  bancoFavorecido?: string;
  agenciaFavorecido?: string;
  contaFavorecido?: string;
  dacFavorecido?: string;
  codigoBarras?: string;
  beneficiarioBoletoConferido?: string | null;
  chavePixTipo?: string;
  chavePixValor?: string;
  valor?: number;
  dataPagamento?: string; // yyyy-mm-dd
  pixCopiaECola?: string; // forma 47
  nfLiquidacao?: { tipoIdentificacao?: string; numero?: string }; // forma 32 (NfLiquidacao)
  dadosTributo?: DadosTributo | Record<string, unknown>; // Segmento N (formato conferido em validarTributo)
};

export const ROTULO_CAMPO: Record<CampoItem, string> = {
  titulo: "Título",
  arquivo: "Geração do arquivo",
  favorecidoNome: "Favorecido",
  favorecidoDocumento: "CPF/CNPJ",
  bancoFavorecido: "Banco",
  agenciaFavorecido: "Agência",
  contaFavorecido: "Conta",
  dacFavorecido: "DAC",
  codigoBarras: "Código de barras / linha digitável",
  chavePix: "Chave PIX",
  valor: "Valor",
  dataPagamento: "Data de pagamento",
  formaPagamento: "Forma de pagamento",
  pixQrCode: "PIX copia e cola",
  nfLiquidacao: "Identificação da NF",
  dadosTributo: "Dados da guia do tributo",
};

function soDigitos(valor: string | undefined | null) {
  return (valor ?? "").replace(/\D/g, "");
}

export function cpfValido(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(cpf[tamanho])) return false;
  }
  return true;
}

export function cnpjValido(cnpj: string) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcular = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcular(cnpj.slice(0, 12));
  const d2 = calcular(cnpj.slice(0, 12) + String(d1));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Dia civil de hoje em Brasilia (yyyy-mm-dd) -- o servidor roda em UTC e viraria o dia 3h antes. */
export function hojeBrasilia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function dataValida(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function validarItemRemessa(item: ItemParaValidar, hoje: string = hojeBrasilia()): ProblemaItem[] {
  const problemas: ProblemaItem[] = [];
  const add = (campo: CampoItem, mensagem: string, gravidade: GravidadeProblema = "erro") =>
    problemas.push({ campo, rotulo: ROTULO_CAMPO[campo], mensagem, gravidade });

  const forma = item.formaPagamento ?? "";
  const formasConhecidas = Object.values(FORMA_PAGAMENTO) as string[];
  if (!formasConhecidas.includes(forma)) {
    add("formaPagamento", `Forma de pagamento "${forma || "vazia"}" não existe no SISPAG (Nota 5 do manual).`);
  } else if (item.segmento && segmentoDaForma(forma) !== item.segmento) {
    add("formaPagamento", `A forma ${forma} usa o segmento ${segmentoDaForma(forma)}, mas o item está como segmento ${item.segmento}.`);
  }
  const segmento = formasConhecidas.includes(forma) ? segmentoDaForma(forma) : item.segmento;

  if (!(item.favorecidoNome ?? "").trim()) add("favorecidoNome", "Informe o nome do favorecido.");

  // CPF/CNPJ: obrigatorio nos Segmentos A, B, J-52 e N (contribuinte). O
  // Segmento O (concessionaria) nao tem campo de documento -- se vier, confere.
  const doc = soDigitos(item.favorecidoDocumento);
  if (segmento === "O" && !doc) {
    // nada a conferir
  } else if (doc.length !== 11 && doc.length !== 14) {
    add(
      "favorecidoDocumento",
      doc.length === 0
        ? "CPF/CNPJ não informado (a Senior não tem esse dado pro fornecedor) -- digite os 11 dígitos do CPF ou 14 do CNPJ."
        : `CPF/CNPJ com ${doc.length} dígito(s) -- precisa ter 11 (CPF) ou 14 (CNPJ).`
    );
  } else {
    const confere = doc.length === 11 ? cpfValido(doc) : cnpjValido(doc);
    if (!confere) add("favorecidoDocumento", `${doc.length === 11 ? "CPF" : "CNPJ"} com dígito verificador inválido -- confira a digitação.`, "erro");
    if (item.favorecidoTipoDoc === "1" && doc.length !== 11) add("favorecidoDocumento", "Tipo de documento está como CPF, mas o número tem 14 dígitos.", "aviso");
    if (item.favorecidoTipoDoc === "2" && doc.length !== 14) add("favorecidoDocumento", "Tipo de documento está como CNPJ, mas o número tem 11 dígitos.", "aviso");
  }

  if (typeof item.valor !== "number" || !isFinite(item.valor) || item.valor <= 0) {
    add("valor", "O valor precisa ser maior que zero.");
  } else if (item.valor >= 100_000_000_000) {
    add("valor", "Valor acima do limite do layout (13 dígitos com centavos).");
  }

  if (!item.dataPagamento || !dataValida(item.dataPagamento)) {
    add("dataPagamento", "Data de pagamento inválida ou vazia.");
  } else if (item.dataPagamento < hoje) {
    add("dataPagamento", "Data de pagamento já passou -- o banco rejeita ou reagenda. Use hoje ou uma data futura.", "aviso");
  }

  if (forma === FORMA_PAGAMENTO.PIX_QR_CODE) {
    try {
      const qr = lerPixCopiaECola(item.pixCopiaECola ?? "");
      if (qr.valor !== null && typeof item.valor === "number" && Math.round(qr.valor * 100) !== Math.round(item.valor * 100)) {
        add("valor", `O QR Code é de R$ ${qr.valor.toFixed(2)} e o item está com R$ ${item.valor.toFixed(2)}.`);
      }
    } catch (e: any) {
      add("pixQrCode", (item.pixCopiaECola ?? "").trim() ? String(e?.message ?? e) : "Cole o PIX copia e cola do QR Code (começa com 000201).");
    }
  } else if (segmento === "O") {
    try {
      const cb = arrecadacaoParaCodigoBarras(item.codigoBarras ?? "");
      const nominal = valorDaArrecadacao(cb);
      if (nominal !== null && typeof item.valor === "number" && Math.round(nominal * 100) !== Math.round(item.valor * 100)) {
        add("valor", `O código de barras é de R$ ${nominal.toFixed(2)} e o item está com R$ ${item.valor.toFixed(2)}.`);
      }
    } catch (e: any) {
      add("codigoBarras", soDigitos(item.codigoBarras) ? String(e?.message ?? e) : "Informe o código de barras da conta/guia (48 dígitos, começa com 8).");
    }
  } else if (segmento === "N") {
    validarTributo(forma, item, add);
  } else if (segmento === "J") {
    const identificacao = identificacaoBeneficiarioBoleto(item.favorecidoDocumento, item.codigoBarras);
    if (identificacao && item.beneficiarioBoletoConferido !== identificacao) {
      add("favorecidoDocumento", "Confirme o CPF/CNPJ do beneficiario registrado neste boleto. O CNPJ do fornecedor e um DV valido nao comprovam correspondencia no cadastro CIP.");
    }
    const digitos = soDigitos(item.codigoBarras);
    if (!digitos) {
      add("codigoBarras", "Boleto sem código de barras -- digite a linha digitável (47 dígitos) ou o código de barras (44).");
    } else if (digitos.length === 48) {
      add(
        "codigoBarras",
        "Linha de 48 dígitos é conta de consumo/concessionária ou tributo com código de barras -- use a forma 13 (concessionária), 19 (tributo municipal) ou 91 (tributo com código de barras), não boleto."
      );
    } else {
      try {
        linhaDigitavelParaCodigoBarras(digitos);
      } catch (e: any) {
        add("codigoBarras", String(e?.message ?? "Código de barras inválido."));
      }
    }
  } else if (segmento === "A") {
    const ehPix = forma === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
    const banco = soDigitos(item.bancoFavorecido);
    const agencia = soDigitos(item.agenciaFavorecido);
    const conta = soDigitos(item.contaFavorecido);
    const dac = (item.dacFavorecido ?? "").trim();
    const temConta = !!(banco && agencia && conta && dac);

    const tipoChave = item.chavePixTipo ?? "";
    const chavePix = (item.chavePixValor ?? "").trim();

    if (ehPix) {
      const tipo = tipoChave;
      const chave = chavePix;
      if (!temConta && (!tipo || !chave)) {
        add("chavePix", "PIX sem chave e sem conta bancária completa -- informe a chave PIX (e o tipo) ou banco/agência/conta/DAC.");
      } else if (chave) {
        const tiposValidos = Object.values(TIPO_CHAVE_PIX) as string[];
        const d = soDigitos(chave);
        const semPais = tipo === TIPO_CHAVE_PIX.TELEFONE && d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
        const nomeDoTipo: Record<string, string> = { "01": "telefone", "02": "e-mail", "04": "aleatória" };
        if (!tiposValidos.includes(tipo)) {
          add("chavePix", "Tipo da chave PIX inválido (telefone, e-mail, CPF/CNPJ ou aleatória).");
        } else if (tipo !== TIPO_CHAVE_PIX.CPF_CNPJ && (doc.length === 11 || doc.length === 14) && (d === doc || semPais === doc)) {
          // 06/10/2026 (título 007940, Anna Clara): na Senior a chave era "+55" + os dígitos do CPF dela,
          // marcada como telefone -- o banco não acha essa chave.
          add(
            "chavePix",
            `A chave PIX (${chave}) tem os mesmos dígitos do CPF/CNPJ do favorecido, mas o tipo está como ${nomeDoTipo[tipo] ?? tipo}. Provavelmente é um CPF/CNPJ digitado no tipo errado: use o tipo CPF/CNPJ (03) ou apague a chave${temConta ? " (a conta bancária completa já basta)" : ""}. Corrija também na Senior.`
          );
        } else if (tipo === TIPO_CHAVE_PIX.TELEFONE && d.length >= 10 && d.length <= 13 && !/^(?:55)?[1-9]\d9\d{8}$/.test(d)) {
          // PIX por telefone é só celular: DDD (2) + 9 + 8 dígitos, com ou sem o 55. Com conta completa o pagamento
          // ainda sai pela conta, então só avisa; sem conta, é a chave que leva o dinheiro.
          add(
            "chavePix",
            `A chave PIX do tipo telefone (${chave}) não é um celular válido (DDD + 9 dígitos começando com 9, ex.: +5531999990000). Confira com o fornecedor.`,
            temConta ? "aviso" : "erro"
          );
        } else if (tipo === TIPO_CHAVE_PIX.EMAIL && !chave.includes("@")) {
          add("chavePix", "Chave PIX do tipo e-mail sem '@'.", "aviso");
        } else if (tipo === TIPO_CHAVE_PIX.CPF_CNPJ && d.length !== 11 && d.length !== 14) {
          add("chavePix", "Chave PIX do tipo CPF/CNPJ precisa ter 11 ou 14 dígitos.", "aviso");
        } else if (tipo === TIPO_CHAVE_PIX.TELEFONE && (d.length < 10 || d.length > 13)) {
          add("chavePix", "Chave PIX do tipo telefone precisa ter DDD + número (10 a 13 dígitos).", "aviso");
        } else if (tipo === TIPO_CHAVE_PIX.ALEATORIA && chave.replace(/-/g, "").length !== 32) {
          add("chavePix", "Chave PIX aleatória precisa ter 32 caracteres (sem os hífens).", "aviso");
        }
      }
    }

    const nf = forma === FORMA_PAGAMENTO.NF_LIQUIDACAO_ELETRONICA;
    if (nf) {
      // Notas 31/32: identificacao 1 (CNPJ do cedente), 2 (numero da NF, exige conta) ou 3 (CNPJ de terceiro/filial).
      const tipoNf = item.nfLiquidacao?.tipoIdentificacao ?? "";
      const numeroNf = soDigitos(item.nfLiquidacao?.numero);
      if (!["1", "2", "3"].includes(tipoNf)) add("nfLiquidacao", "Escolha como a NF é identificada: 1 CNPJ do cedente, 2 número da NF ou 3 CNPJ de terceiro/filial.");
      else if (tipoNf === "2" && (!numeroNf || numeroNf.length > 8)) add("nfLiquidacao", "Informe o número da NF (até 8 dígitos).");
      else if (tipoNf === "3" && !cnpjValido(numeroNf)) add("nfLiquidacao", "Informe o CNPJ de terceiro/filial (14 dígitos válidos).");
    }

    // Credito/TED: conta completa obrigatoria. Cheque/OP: so' agencia Itau
    // (Nota 11 a). PIX: a chave dispensa a conta. NF: conta so' quando
    // identificada pelo numero da NF (Nota 31).
    const soAgencia = formaSoAgencia(forma);
    const contaOpcional = ehPix || (nf && item.nfLiquidacao?.tipoIdentificacao !== "2");
    const validarConta = !contaOpcional || temConta;
    if (soAgencia) {
      if (banco && banco !== "341" && banco !== "409") add("bancoFavorecido", "Cheque e ordem de pagamento ficam numa agência Itaú: use banco 341.");
      if (!agencia) add("agenciaFavorecido", "Informe a agência Itaú onde o cheque/OP fica à disposição.");
      else if (agencia.length > 4) add("agenciaFavorecido", `Agência com ${agencia.length} dígitos -- agência Itaú tem 4.`);
    } else if (validarConta) {
      if (!contaOpcional) {
        if (!banco) add("bancoFavorecido", "Banco do favorecido não informado.");
        if (!agencia) add("agenciaFavorecido", "Agência do favorecido não informada.");
        if (!conta) add("contaFavorecido", "Conta do favorecido não informada.");
        if (!dac) add("dacFavorecido", "Dígito (DAC) da conta não informado.");
      }
      if (formaSoItau(forma) && banco && banco !== "341" && banco !== "409") {
        add("formaPagamento", `A forma ${forma} só credita conta no Itaú; para o banco ${banco} use TED (41/43) ou PIX.`);
      }
      if (banco.length > 3) add("bancoFavorecido", `Código do banco com ${banco.length} dígitos -- são 3 (ex.: 341 Itaú).`);
      if (dac.length > 1) add("dacFavorecido", "O DAC é um único caractere -- o dígito não pode vir junto da conta.");

      const itau = banco === "341" || banco === "409";
      const limiteAgencia = itau ? 4 : 5;
      const limiteConta = itau ? 6 : 12;
      if (agencia.length > limiteAgencia) {
        add("agenciaFavorecido", `Agência com ${agencia.length} dígitos -- ${itau ? "contas Itaú/Unibanco" : "esse banco"} aceita até ${limiteAgencia}.`);
      }
      if (conta.length > limiteConta) {
        add(
          "contaFavorecido",
          `Conta com ${conta.length} dígitos -- ${itau ? "contas Itaú/Unibanco" : "esse banco"} aceita até ${limiteConta}. Confira se o DAC não foi digitado junto da conta.`
        );
      }
    }
  }

  return problemas;
}

// Segmento N: dados obrigatorios de cada guia (Anexo C) e soma das partes = valor do item.
const TRIBUTO_ESPERADO: Record<string, DadosTributo["tributo"]> = {
  [FORMA_PAGAMENTO.DARF_NORMAL]: "DARF",
  [FORMA_PAGAMENTO.GPS]: "GPS",
  [FORMA_PAGAMENTO.DARF_SIMPLES]: "DARF_SIMPLES",
  [FORMA_PAGAMENTO.GARE_SP_ICMS]: "GARE_SP",
  [FORMA_PAGAMENTO.IPVA]: "IPVA",
  [FORMA_PAGAMENTO.DPVAT]: "DPVAT",
  [FORMA_PAGAMENTO.FGTS]: "FGTS",
};

function validarTributo(forma: string, item: ItemParaValidar, add: (campo: CampoItem, mensagem: string, gravidade?: GravidadeProblema) => void) {
  const d = item.dadosTributo as DadosTributo | undefined;
  const esperado = TRIBUTO_ESPERADO[forma];
  if (!d) return add("dadosTributo", "Preencha os dados da guia do tributo (código da receita, período, valores).");
  if (d.tributo !== esperado) return add("dadosTributo", `Os dados da guia são de ${d.tributo}, mas a forma ${forma} é ${esperado}.`);
  const faltando: string[] = [];
  const exigir = (rotulo: string, valor: string | undefined, digitos: number) => {
    const v = soDigitos(valor);
    if (!v || v.length > digitos) faltando.push(`${rotulo} (até ${digitos} dígitos)`);
  };
  const exigirData = (rotulo: string, valor: string | undefined) => {
    if (!valor || !dataValida(valor)) faltando.push(rotulo);
  };
  const exigirMmaaaa = (rotulo: string, valor: string | undefined) => {
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(soDigitos(valor))) faltando.push(`${rotulo} (MMAAAA)`);
  };
  switch (d.tributo) {
    case "GPS":
      exigir("Código de pagamento", d.codigoPagamento, 4);
      exigirMmaaaa("Competência", d.competencia);
      exigir("Identificador (CNPJ/CEI/NIT)", d.identificador, 14);
      break;
    case "DARF":
      exigir("Código da receita", d.codigoReceita, 4);
      exigirData("Período de apuração", d.periodoApuracao);
      exigirData("Vencimento", d.vencimento);
      if (d.referencia && soDigitos(d.referencia).length > 17) faltando.push("Referência (até 17 dígitos)");
      break;
    case "DARF_SIMPLES":
      exigir("Código da receita", d.codigoReceita, 4);
      exigirData("Período de apuração", d.periodoApuracao);
      exigirData("Vencimento", d.vencimento);
      if (!(d.receitaBruta >= 0 && d.receitaBruta < 10_000_000)) faltando.push("Receita bruta acumulada (até 9.999.999,99)");
      if (!(d.percentual >= 0 && d.percentual < 100)) faltando.push("Percentual (até 99,99)");
      break;
    case "GARE_SP":
      exigir("Código da receita", d.codigoReceita, 4);
      exigir("Inscrição estadual", d.inscricaoEstadual, 12);
      exigirMmaaaa("Referência", d.referencia);
      exigirData("Vencimento", d.vencimento);
      break;
    case "IPVA":
    case "DPVAT":
      exigir("Exercício", d.exercicio, 4);
      exigir("RENAVAM", d.renavam, 12);
      if (!/^(MG|SP)$/i.test(d.uf ?? "")) faltando.push("UF (o SISPAG só paga IPVA/DPVAT de MG e SP)");
      if (!(d.placa ?? "").trim()) faltando.push("Placa");
      if (!/^[0-8]$/.test(d.opcaoPagamento ?? "")) faltando.push("Opção de pagamento (Nota 28)");
      if (d.tributo === "IPVA") { exigir("Código do município", d.codigoMunicipio, 5); exigirData("Vencimento", d.vencimento); }
      break;
    case "FGTS":
      exigir("Código da receita", d.codigoReceita, 4);
      if (!["1", "2"].includes(d.tipoInscricao)) faltando.push("Tipo de inscrição (1 CNPJ / 2 CEI)");
      if (soDigitos(d.codigoBarras).length !== 48) faltando.push("Código de barras da guia (48 dígitos)");
      exigir("Identificador do FGTS", d.identificador, 16);
      exigir("Lacre da Conectividade Social", d.lacre, 9);
      exigir("Dígito do lacre", d.digitoLacre, 2);
      break;
  }
  if (faltando.length) add("dadosTributo", `Falta ou está inválido na guia: ${faltando.join(", ")}.`);
  if (typeof item.valor === "number" && d.tributo !== "FGTS") {
    const total = totalDoTributo(d, item.valor);
    if (Math.round(total * 100) !== Math.round(item.valor * 100)) {
      add("dadosTributo", `As partes da guia somam R$ ${total.toFixed(2)}, mas o valor do item é R$ ${item.valor.toFixed(2)}.`);
    }
  }
}

export function temErroBloqueante(problemas: ProblemaItem[]) {
  return problemas.some((p) => p.gravidade === "erro");
}
