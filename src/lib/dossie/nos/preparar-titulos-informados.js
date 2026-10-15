// @ts-nocheck
// No Code do workflow n8n "Preparar Títulos Informados" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const item = $input.first().json;

const ordemCompra = item.ordemCompra || {};
const campos = ordemCompra.camposCustomizados || {};

const empresa = ordemCompra.empresa;
const fornecedor = ordemCompra.fornecedor?.codigo ?? null;

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
    numTit: numeroTitulo
  }
}));
}
