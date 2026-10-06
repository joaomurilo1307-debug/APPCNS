// Correcao automatica de chave PIX cadastrada com o tipo errado na Senior.
//
// Caso real (06/10/2026, titulo 007940, Anna Clara): na Senior a chave era "+55" + os
// 11 digitos do CPF dela, marcada como TELEFONE (tipo 1). Nao e' um celular (depois do
// DDD vem "1", e celular comeca com 9) e o banco nao acha essa chave. Quando os digitos
// da chave -- com ou sem o 55 do pais -- sao exatamente o CPF/CNPJ do proprio favorecido,
// o que a pessoa quis dizer e' "chave = CPF/CNPJ" (tipo 03). Corrige sozinho e avisa;
// a causa (cadastro na Senior) continua precisando ser arrumada la'.
//
// Funcao pura: usada na conferencia, na montagem do arquivo e na tela.

const soDigitos = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");

export type ChavePixCorrigida = {
  tipo: string | undefined;
  valor: string | undefined;
  /** Mensagem pra mostrar quando houve correcao; null quando a chave ficou como veio. */
  correcao: string | null;
};

export function corrigirChavePix(
  tipo: string | undefined,
  valor: string | undefined,
  documento: string | undefined
): ChavePixCorrigida {
  const chave = (valor ?? "").trim();
  const doc = soDigitos(documento);
  if (!chave || tipo !== "01" || (doc.length !== 11 && doc.length !== 14)) return { tipo, valor, correcao: null };

  const d = soDigitos(chave);
  const semPais = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (d !== doc && semPais !== doc) return { tipo, valor, correcao: null };

  return {
    tipo: "03",
    valor: doc,
    correcao: `A chave PIX cadastrada (${chave}) era o CPF/CNPJ do favorecido digitado como telefone — o sistema usou tipo CPF/CNPJ (03) com ${doc}. Corrija também no cadastro da Senior.`,
  };
}
