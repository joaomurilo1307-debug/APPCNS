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

import { linhaDigitavelParaCodigoBarras } from "./codigoBarras";
import { FORMA_PAGAMENTO, TIPO_CHAVE_PIX, segmentoDaForma } from "./constantes";

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
  | "formaPagamento";

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
  chavePixTipo?: string;
  chavePixValor?: string;
  valor?: number;
  dataPagamento?: string; // yyyy-mm-dd
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
    add("formaPagamento", `Forma de pagamento "${forma || "vazia"}" não é suportada neste layout (use crédito em conta, TED, PIX ou boleto).`);
  } else if (item.segmento && segmentoDaForma(forma) !== item.segmento) {
    add("formaPagamento", `A forma ${forma} usa o segmento ${segmentoDaForma(forma)}, mas o item está como segmento ${item.segmento}.`);
  }
  const segmento = formasConhecidas.includes(forma) ? segmentoDaForma(forma) : item.segmento;

  if (!(item.favorecidoNome ?? "").trim()) add("favorecidoNome", "Informe o nome do favorecido.");

  // CPF/CNPJ: obrigatorio em qualquer segmento (Segmento A, B e J-52 do CNAB).
  const doc = soDigitos(item.favorecidoDocumento);
  if (doc.length !== 11 && doc.length !== 14) {
    add(
      "favorecidoDocumento",
      doc.length === 0
        ? "CPF/CNPJ não informado (a Senior não tem esse dado pro fornecedor) -- digite os 11 dígitos do CPF ou 14 do CNPJ."
        : `CPF/CNPJ com ${doc.length} dígito(s) -- precisa ter 11 (CPF) ou 14 (CNPJ).`
    );
  } else {
    const confere = doc.length === 11 ? cpfValido(doc) : cnpjValido(doc);
    if (!confere) add("favorecidoDocumento", `${doc.length === 11 ? "CPF" : "CNPJ"} com dígito verificador inválido -- confira a digitação.`, "aviso");
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

  if (segmento === "J") {
    const digitos = soDigitos(item.codigoBarras);
    if (!digitos) {
      add("codigoBarras", "Boleto sem código de barras -- digite a linha digitável (47 dígitos) ou o código de barras (44).");
    } else if (digitos.length === 48) {
      add(
        "codigoBarras",
        "Linha de 48 dígitos é conta de consumo/concessionária (luz, água, telefone, tributo) -- este layout só aceita boleto bancário de 47 ou 44 dígitos. Pague essa por outro meio."
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

    // Crédito/TED: conta completa obrigatória. PIX: a chave dispensa a conta
    // (e já foi cobrada acima) -- só confere o tamanho se a conta veio completa,
    // porque aí é ela que vai pro arquivo.
    const validarConta = !ehPix || temConta;
    if (validarConta) {
      if (!ehPix) {
        if (!banco) add("bancoFavorecido", "Banco do favorecido não informado.");
        if (!agencia) add("agenciaFavorecido", "Agência do favorecido não informada.");
        if (!conta) add("contaFavorecido", "Conta do favorecido não informada.");
        if (!dac) add("dacFavorecido", "Dígito (DAC) da conta não informado.");
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

export function temErroBloqueante(problemas: ProblemaItem[]) {
  return problemas.some((p) => p.gravidade === "erro");
}
