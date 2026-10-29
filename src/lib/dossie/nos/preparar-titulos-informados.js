// @ts-nocheck
// No Code do workflow n8n "Preparar Títulos Informados" (Dossie OC SeniorX v6.4), ALTERADO em 29/10/2026: passa codForGrupo (fornecedores do mesmo grupo de empresas).
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const item = $input.first().json;

const ordemCompra = item.ordemCompra || {};
const campos = ordemCompra.camposCustomizados || {};

const empresa = ordemCompra.empresa;
const fornecedor = ordemCompra.fornecedor?.codigo ?? null;

// Titulo pode estar no cadastro de outro fornecedor do MESMO GRUPO (E095FOR.CODGRE): marketplace (Mercado Livre, Magalu...) tem
// um cadastro por vendedor. "Grupo do Fornecedor" e' pre-carregado por gerar.ts; sem ele vale so' o fornecedor da OC.
const codForGrupo = (() => {
  let codigos = [];
  try {
    codigos = $('Grupo do Fornecedor').first().json.codigos || [];
  } catch (e) {
    codigos = [];
  }
  codigos = [...new Set([fornecedor, ...codigos].map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return codigos.length ? codigos.join(',') : '';
})();

const textoTitulos = campos.titulosInformados || '';

// Exemplo atual:
// "398A1 - 196$01"
//
// A ideia é transformar isso em:
// 398A1
// 196$01

const titulos = textoTitulos
  .split(/\s+-\s+|;|\r?\n/)
  .map(t => t.trim())
  .filter(Boolean);

return titulos.map(numeroTitulo => ({
  json: {
    codEmp: empresa,
    codFor: fornecedor,
    codForGrupo,
    numTit: numeroTitulo
  }
}));
}
