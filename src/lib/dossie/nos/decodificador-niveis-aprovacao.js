// @ts-nocheck
// No Code do workflow n8n "Decodificador Níveis Aprovação" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();

return items.map(item => {

  const soap = item.json.data || '';

  // Verifica erro retornado pelo Senior
  const erroMatch = soap.match(
    /<erroExecucao[^>]*>([\s\S]*?)<\/erroExecucao>/i
  );

  if (erroMatch && erroMatch[1].trim()) {
    throw new Error(
      `Erro retornado pelo Senior GetDBInfo: ${erroMatch[1].trim()}`
    );
  }

  // Localiza o conteúdo Base64
  const retornoMatch = soap.match(
    /<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/i
  );

  if (!retornoMatch) {
    throw new Error(
      'pmReturnGetDBInfo não foi encontrado.'
    );
  }

  const base64 = retornoMatch[1]
    .replace(/\s+/g, '')
    .trim();

  // Caso não existam registros
  if (!base64) {
    return {
      json: {
        aprovacaoNiveisXml: null,
        quantidadeRegistros: 0
      }
    };
  }

  // Decodifica o Base64 retornado pelo GetDBInfo
  const xml = Buffer
    .from(base64, 'base64')
    .toString('latin1');

  // Conta os registros retornados
  const linhas =
    xml.match(/<line>[\s\S]*?<\/line>/gi) || [];

  return {
    json: {
      aprovacaoNiveisXml: xml,
      quantidadeRegistros: linhas.length
    }
  };

});
}
