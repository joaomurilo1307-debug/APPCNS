// Decompoe o codigo de barras de 44 digitos de um boleto (Segmento J,
// posicoes 018-061 -- Nota 18 e Anexo A do manual SISPAG) nos sub-campos
// que o CNAB exige separados. A "linha digitavel" impressa no boleto (47
// digitos, com os DVs de campo do Anexo A) NAO e' o mesmo dado -- se vier
// dela, os digitos verificadores de campo sao conferidos e removidos.
//
// Os digitos verificadores sao validados aqui (Anexo A, itens 3 e 4) porque
// uma linha digitada errada em producao seria paga pro boleto errado, ou
// rejeitada pelo banco depois de ja ter passado pelo fluxo de autorizacao.

export type CodigoBarrasDecomposto = {
  bancoFavorecido: string; // 3
  moeda: string; // 1
  dvCodigoBarras: string; // 1
  fatorVencimento: string; // 4
  valor: string; // 10 (9(08)V9(02))
  campoLivre: string; // 25
};

// Modulo 10 (Anexo A, item 4): pesos 2,1,2,1... da direita pra esquerda,
// soma os algarismos de cada produto, DV = 10 - resto (10 vira 0).
function dvModulo10(campo: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = campo.length - 1; i >= 0; i--) {
    const produto = Number(campo[i]) * peso;
    soma += Math.floor(produto / 10) + (produto % 10);
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

// Modulo 11 (Anexo A, item 3): 43 digitos sem a 5a posicao, pesos 2..9
// ciclicos da direita pra esquerda, DV = 11 - resto; 0, 1, 10 ou 11 viram 1.
function dvModulo11CodigoBarras(cb44: string): number {
  const sem = cb44.slice(0, 4) + cb44.slice(5);
  let soma = 0;
  let peso = 2;
  for (let i = sem.length - 1; i >= 0; i--) {
    soma += Number(sem[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv <= 1 || dv >= 10 ? 1 : dv;
}

export function parseCodigoBarras(codigoBarras44: string): CodigoBarrasDecomposto {
  const cb = codigoBarras44.replace(/\D/g, "");
  if (cb.length !== 44) {
    throw new Error(`Codigo de barras deve ter 44 digitos (recebido ${cb.length}): "${codigoBarras44}"`);
  }
  if (dvModulo11CodigoBarras(cb) !== Number(cb[4])) {
    throw new Error(`Codigo de barras invalido: digito verificador geral nao confere ("${codigoBarras44}"). Confira a digitacao.`);
  }
  return {
    bancoFavorecido: cb.slice(0, 3),
    moeda: cb.slice(3, 4),
    dvCodigoBarras: cb.slice(4, 5),
    fatorVencimento: cb.slice(5, 9),
    valor: cb.slice(9, 19),
    campoLivre: cb.slice(19, 44),
  };
}

/**
 * Converte a "linha digitavel" (47 digitos, com DV de campo a cada bloco --
 * formato que a maioria dos leitores/usuarios digita) para o codigo de
 * barras de 44 digitos (sem os DVs de campo), conforme Anexo A do manual.
 * Aceita tambem um codigo ja de 44 digitos (devolve como veio, so' valida).
 */
export function linhaDigitavelParaCodigoBarras(linha: string): string {
  const digitos = linha.replace(/\D/g, "");
  if (digitos.length === 44) {
    parseCodigoBarras(digitos);
    return digitos;
  }
  if (digitos.length !== 47) {
    throw new Error(`Linha digitavel deve ter 47 digitos (recebido ${digitos.length}): "${linha}"`);
  }
  // Campo 1: banco(3)+moeda(1)+5 primeiras posicoes do campo livre, DV na pos 10
  const campo1 = digitos.slice(0, 9);
  const campo2 = digitos.slice(10, 20);
  const campo3 = digitos.slice(21, 31);
  const dvGeral = digitos.slice(32, 33);
  const fatorValor = digitos.slice(33, 47); // fator vencimento (4) + valor (10)

  const confere =
    dvModulo10(campo1) === Number(digitos[9]) &&
    dvModulo10(campo2) === Number(digitos[20]) &&
    dvModulo10(campo3) === Number(digitos[31]);
  if (!confere) {
    throw new Error(`Linha digitavel invalida: digito verificador de campo nao confere ("${linha}"). Confira a digitacao.`);
  }

  const cb44 = `${campo1.slice(0, 4)}${dvGeral}${fatorValor}${campo1.slice(4)}${campo2}${campo3}`;
  parseCodigoBarras(cb44);
  return cb44;
}

/**
 * Data de vencimento a partir do fator de vencimento (posicoes 6-9 do codigo
 * de barras). O fator conta dias desde 07/10/1997 e, ao chegar em 9999,
 * recomecou em 1000 (22/02/2025) -- ou seja, o mesmo fator aparece a cada
 * 9000 dias. Escolhe-se o ciclo cuja data fica mais perto da data de
 * referencia (hoje), que e' o criterio da propria FEBRABAN. Fator 0000 =
 * boleto sem vencimento (devolve null).
 */
export function dataVencimentoDoFator(fator: string, referencia: Date = new Date()): Date | null {
  const n = Number(fator);
  if (!n) return null;
  const DIA = 86400000;
  const base = Date.UTC(1997, 9, 7);
  let melhor: number | null = null;
  let menorDiferenca = Infinity;
  for (let ciclo = 0; ciclo <= 4; ciclo++) {
    const candidata = base + (n + ciclo * 9000) * DIA;
    const diferenca = Math.abs(candidata - referencia.getTime());
    if (diferenca < menorDiferenca) {
      menorDiferenca = diferenca;
      melhor = candidata;
    }
  }
  return melhor === null ? null : new Date(melhor);
}

/** Valor nominal do boleto (10 digitos, 2 decimais) -- 0 quando o boleto e' de valor aberto. */
export function valorDoCodigoBarras(valor10: string): number {
  return Number(valor10) / 100;
}

// ---------------------------------------------------------------------------
// Codigo de arrecadacao (concessionarias e tributos com codigo de barras,
// Segmento O -- Anexo B do manual). Sempre comeca com "8". A representacao
// numerica impressa tem 48 digitos (4 campos de 11 + DV de campo); o codigo
// de barras tem 44. Porta de codigo_barras.py do TicketsSystem (validado em
// remessa real 05/10/2026).

// Anexo B, item 3.2: pesos 2..9 ciclicos da direita pra esquerda, DV = 11 - resto; 0, 1, 10 ou 11 viram 1.
function dvModulo11Arrecadacao(cb43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = cb43.length - 1; i >= 0; i--) {
    soma += Number(cb43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv <= 1 || dv >= 10 ? 1 : dv;
}

/** Codigo de arrecadacao (48 ou 44 digitos) -> codigo de barras de 44, com todos os DVs conferidos. */
export function arrecadacaoParaCodigoBarras(linha: string): string {
  let digitos = (linha ?? "").replace(/\D/g, "");
  if (digitos.length === 48) {
    const campos = [0, 1, 2, 3].map((i) => digitos.slice(i * 12, i * 12 + 11));
    if (campos.some((c, i) => dvModulo10(c) !== Number(digitos[i * 12 + 11]))) {
      throw new Error("Codigo de arrecadacao invalido: digito verificador de campo nao confere. Confira a digitacao.");
    }
    digitos = campos.join("");
  }
  if (digitos.length !== 44) throw new Error(`Codigo de arrecadacao deve ter 48 (ou 44) digitos (recebido ${digitos.length}).`);
  if (digitos[0] !== "8") throw new Error("Codigo de arrecadacao comeca sempre com 8. Boleto bancario usa as formas 30/31.");
  const semDv = digitos.slice(0, 3) + digitos.slice(4);
  let dv: number;
  if ("67".includes(digitos[2])) dv = dvModulo10(semDv);
  else if ("89".includes(digitos[2])) dv = dvModulo11Arrecadacao(semDv);
  else throw new Error(`Identificacao de valor invalida na 3a posicao do codigo de arrecadacao ("${digitos[2]}").`);
  if (dv !== Number(digitos[3])) throw new Error("Codigo de arrecadacao invalido: digito verificador geral nao confere. Confira a digitacao.");
  return digitos;
}

/** Valor em reais (posicoes 5-15) quando a 3a posicao e' 6 ou 8; null quando e' valor de referencia (7/9). */
export function valorDaArrecadacao(cb44: string): number | null {
  return "68".includes(cb44[2]) ? Number(cb44.slice(4, 15)) / 100 : null;
}
