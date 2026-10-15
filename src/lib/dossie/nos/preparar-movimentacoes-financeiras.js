// @ts-nocheck
// No Code do workflow n8n "Preparar Movimentações Financeiras" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const item = $input.first().json;

const titulos = item.titulos || [];

return titulos.map(titulo => ({
  json: {
    codEmp: titulo.empresa,
    codFil: titulo.filial,
    codFor: titulo.fornecedor,
    numTit: titulo.numero,
    codTpt: titulo.tipo,
    valorOriginal: titulo.valores?.original ?? null,
    valorAberto: titulo.valores?.aberto ?? null
  }
}));
}
