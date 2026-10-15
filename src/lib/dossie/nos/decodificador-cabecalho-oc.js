// @ts-nocheck
// No Code do workflow n8n "Decodificador Cabeçalho OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();

return items.map(item => {
  const soap = item.json.data || '';

  // Verifica se o WebService retornou erro
  const erroMatch = soap.match(
    /<erroExecucao[^>]*>([\s\S]*?)<\/erroExecucao>/i
  );

  if (erroMatch && erroMatch[1].trim()) {
    throw new Error(
      `Erro retornado pelo Senior GetDBInfo: ${erroMatch[1].trim()}`
    );
  }

  // Extrai o conteúdo Base64 retornado pelo GetDBInfo
  const retornoMatch = soap.match(
    /<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/i
  );

  if (!retornoMatch) {
    throw new Error(
      'O campo pmReturnGetDBInfo não foi encontrado na resposta SOAP.'
    );
  }

  const base64 = retornoMatch[1]
    .replace(/\s+/g, '')
    .trim();

  if (!base64) {
    throw new Error(
      'O GetDBInfo retornou pmReturnGetDBInfo vazio.'
    );
  }

  // O GetDBInfo retorna o XML em Base64.
  // A Senior utiliza ISO-8859-1 nesse retorno.
  const xmlDecodificado = Buffer
    .from(base64, 'base64')
    .toString('latin1');

  return {
    json: {
      cabecalhoXml: xmlDecodificado
    }
  };
});
}
