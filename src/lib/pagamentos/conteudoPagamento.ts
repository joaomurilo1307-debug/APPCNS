// "Conteudo" do pagamento mostrado dentro da OC: alem do codigo e do nome da
// forma de pagamento (ex.: 18 - Boleto), o dado que de fato permite pagar --
// codigo de barras do boleto, chave PIX, conta bancaria. Pedido do Gabriel
// (06/10/2026). Quando a Senior nao tem esse dado, devolve uma mensagem de erro
// dizendo que nao foi encontrado na Senior (nunca um campo em branco).
//
// Modulo PURO (sem banco, sem Senior, sem React): o modal da OC e os testes usam
// a mesma regra. Quem monta as fontes e' o chamador:
//  - oc: o que o comprador digitou na propria OC (E420OCP.USU_CHVPIX/USU_CODAGE/
//    USU_NUMCCO/USU_DESCCO), lido ao vivo da Senior;
//  - titulos: o que a Senior tem nos titulos que a OC gerou (E501TCP: CODBAR,
//    CHVPIX/TPCPIX, CODBAN/CODAGE/CCBFOR, ou o cadastro bancario do fornecedor).
//
// O tipo vem do CODIGO/DESCRICAO da forma (catalogo F066FPG da empresa 1):
//   1 Cobranca Bancaria e 18 Boleto -> codigo de barras
//   19 PIX                          -> chave PIX
//   3 Deposito em Conta e 4 Ordem de Pagto -> conta bancaria
//   demais (cartao, fatura, remessa, dinheiro, cheque...) -> o que houver de
//   dado de pagamento; sem nada, mensagem de nao encontrado.

export type TipoConteudo = "BOLETO" | "PIX" | "CONTA" | "OUTRA";

export type ItemConteudo = { rotulo: string; valor: string; origem: "OC" | "título" };

export type ConteudoPagamento = {
  tipo: TipoConteudo;
  itens: ItemConteudo[];
  /** Preenchido quando nao ha o dado esperado: "... nao foi encontrado na Senior." */
  erro: string | null;
};

export type DadosDaOc = {
  chavePix: string | null;
  agencia: string | null;
  conta: string | null;
  contaDescricao: string | null;
};

export type DadosDoTitulo = {
  numTit: string;
  codigoBarras?: string | null;
  chavePix?: string | null;
  tipoChavePix?: string | null; // codigo TPCPIX da Senior
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  dac?: string | null;
};

const TIPO_CHAVE_PIX: Record<string, string> = { "1": "telefone", "2": "e-mail", "3": "CPF/CNPJ", "4": "aleatória" };

const CODIGOS_BOLETO = new Set(["1", "18"]);
const CODIGOS_PIX = new Set(["19"]);
const CODIGOS_CONTA = new Set(["3", "4"]);

export function tipoDaForma(codFpg: string | null, descricao: string | null): TipoConteudo {
  const d = (descricao ?? "").toLowerCase();
  if (/\bpix\b/.test(d)) return "PIX";
  if (/boleto|cobran[cç]a/.test(d)) return "BOLETO";
  if (/dep[oó]sito|ordem de pag|transfer|\bted\b|\bdoc\b/.test(d)) return "CONTA";
  if (codFpg && CODIGOS_PIX.has(codFpg)) return "PIX";
  if (codFpg && CODIGOS_BOLETO.has(codFpg)) return "BOLETO";
  if (codFpg && CODIGOS_CONTA.has(codFpg)) return "CONTA";
  return "OUTRA";
}

const preenchido = (v: string | null | undefined) => (v ?? "").trim() !== "" && !/^0+$/.test((v ?? "").trim());

function barras(titulos: DadosDoTitulo[]): ItemConteudo[] {
  return titulos
    .filter((t) => preenchido(t.codigoBarras))
    .map((t) => ({ rotulo: `Código de barras (título ${t.numTit})`, valor: String(t.codigoBarras).trim(), origem: "título" as const }));
}

function pix(oc: DadosDaOc | null, titulos: DadosDoTitulo[]): ItemConteudo[] {
  const itens: ItemConteudo[] = [];
  if (oc && preenchido(oc.chavePix)) itens.push({ rotulo: "Chave PIX", valor: oc.chavePix!.trim(), origem: "OC" });
  for (const t of titulos) {
    if (!preenchido(t.chavePix)) continue;
    const tipo = t.tipoChavePix ? TIPO_CHAVE_PIX[t.tipoChavePix] : null;
    itens.push({ rotulo: `Chave PIX${tipo ? ` (${tipo})` : ""} (título ${t.numTit})`, valor: t.chavePix!.trim(), origem: "título" });
  }
  return itens;
}

function conta(oc: DadosDaOc | null, titulos: DadosDoTitulo[]): ItemConteudo[] {
  const itens: ItemConteudo[] = [];
  if (oc && (preenchido(oc.agencia) || preenchido(oc.conta))) {
    const partes = [
      preenchido(oc.agencia) ? `ag ${oc.agencia!.trim()}` : null,
      preenchido(oc.conta) ? `cc ${oc.conta!.trim()}` : null,
      preenchido(oc.contaDescricao) ? oc.contaDescricao!.trim() : null,
    ].filter(Boolean);
    itens.push({ rotulo: "Conta bancária", valor: partes.join(" · "), origem: "OC" });
  }
  for (const t of titulos) {
    if (!preenchido(t.agencia) && !preenchido(t.conta)) continue;
    const partes = [
      preenchido(t.banco) ? `banco ${t.banco!.trim()}` : null,
      preenchido(t.agencia) ? `ag ${t.agencia!.trim()}` : null,
      preenchido(t.conta) ? `cc ${t.conta!.trim()}${preenchido(t.dac) ? `-${t.dac!.trim()}` : ""}` : null,
    ].filter(Boolean);
    itens.push({ rotulo: `Conta bancária (título ${t.numTit})`, valor: partes.join(" · "), origem: "título" });
  }
  return itens;
}

/** Remove repeticoes exatas (ex.: varias parcelas apontando pra mesma conta). */
function semRepetidos(itens: ItemConteudo[]): ItemConteudo[] {
  const vistos = new Set<string>();
  return itens.filter((i) => {
    const k = `${i.rotulo.replace(/ \(título [^)]*\)$/, "")}|${i.valor}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export function montarConteudoPagamento(entrada: {
  codFpg: string | null;
  formaPagamento: string | null;
  oc: DadosDaOc | null;
  titulos: DadosDoTitulo[];
}): ConteudoPagamento {
  const tipo = tipoDaForma(entrada.codFpg, entrada.formaPagamento);
  const { oc, titulos } = entrada;

  if (tipo === "BOLETO") {
    const itens = semRepetidos(barras(titulos));
    return { tipo, itens, erro: itens.length ? null : "Código de barras do boleto não foi encontrado na Sênior." };
  }
  if (tipo === "PIX") {
    const itens = semRepetidos(pix(oc, titulos));
    return { tipo, itens, erro: itens.length ? null : "Chave PIX não foi encontrada na Sênior." };
  }
  if (tipo === "CONTA") {
    const itens = semRepetidos(conta(oc, titulos));
    return { tipo, itens, erro: itens.length ? null : "Dados bancários (agência e conta) não foram encontrados na Sênior." };
  }

  // Cartao, fatura, remessa, dinheiro, cheque, sem forma informada...: mostra o que a Senior tiver.
  const itens = semRepetidos([...barras(titulos), ...pix(oc, titulos), ...conta(oc, titulos)]);
  const forma = entrada.formaPagamento ? `"${entrada.formaPagamento}"` : "esta OC";
  return {
    tipo,
    itens,
    erro: itens.length ? null : `Nenhum dado de pagamento (código de barras, chave PIX ou conta bancária) foi encontrado na Sênior para ${forma}.`,
  };
}
