// @ts-nocheck
// No Code do workflow n8n "Preparar Notas Fiscais" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const item = $input.first().json;

const titulos = item.titulos || [];

const mapaNotas = new Map();

for (const titulo of titulos) {

  const nf = titulo.notaFiscal || {};

  if (!nf.possuiVinculo) {
    continue;
  }

  if (
    titulo.empresa === null ||
    nf.filial === null ||
    nf.fornecedor === null ||
    nf.numero === null ||
    !nf.serie
  ) {
    continue;
  }

  const chave = [
    titulo.empresa,
    nf.filial,
    nf.fornecedor,
    nf.numero,
    nf.serie
  ].join('|');

  // Evita consultar a mesma nota duas vezes
  if (!mapaNotas.has(chave)) {

    mapaNotas.set(chave, {
      codEmp: titulo.empresa,
      codFil: nf.filial,
      codFor: nf.fornecedor,
      numNfc: nf.numero,
      codSnf: nf.serie,

      tituloOrigem: titulo.numero,
      tipoTitulo: titulo.tipo,

      valorTitulo:
        titulo.valores?.original ?? null
    });

  }

}

return Array.from(mapaNotas.values()).map(nota => ({
  json: nota
}));
}
