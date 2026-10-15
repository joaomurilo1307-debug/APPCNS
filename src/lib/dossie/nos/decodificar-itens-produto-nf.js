// @ts-nocheck
// No Code do workflow n8n "Decodificar Itens Produto NF" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();

function getTag(xml, tagName) {
  const regex = new RegExp(
    `<${tagName}>([\\s\\S]*?)<\\/${tagName}>`,
    'i'
  );

  const match = xml.match(regex);

  if (!match) {
    return null;
  }

  const value = String(match[1]).trim();

  return value === '' ? null : value;
}

return items.map(item => {

  const soap = item.json.data || '';

  const matchBase64 = soap.match(
    /<pmReturnGetDBInfo>([\s\S]*?)<\/pmReturnGetDBInfo>/i
  );

  if (!matchBase64) {
    return {
      json: {
        itensProdutoXml: null,
        quantidadeRegistros: 0,
        erro: 'pmReturnGetDBInfo não encontrado'
      }
    };
  }

  const base64 = matchBase64[1].trim();

  const xml = Buffer
    .from(base64, 'base64')
    .toString('latin1');

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ];

  return {
    json: {
      itensProdutoXml: xml,
      quantidadeRegistros: linhas.length
    }
  };

});
}
