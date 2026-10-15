// @ts-nocheck
// No Code do workflow n8n "Decodificador Fornecedor" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// DECODIFICAR FORNECEDOR
// Mesmo padrão dos demais decodificadores GetDBInfo:
// extrai o pmReturnGetDBInfo (Base64) e converte para XML latin1.
// Carrega junto o item do "Normalizar Cabeçalho OC" para que a
// cadeia siga transparente para os nós seguintes.
// ============================================================

const items = $input.all();

const cabecalho = (() => {
  try {
    return $('Normalizar Cabeçalho OC').first().json || {};
  } catch (e) {
    return {};
  }
})();

return items.map((item) => {
  const soap = item.json.data || '';

  const erro = soap.match(/<erroExecucao[^>]*>([\s\S]*?)<\/erroExecucao>/i);
  if (erro && erro[1].trim()) {
    throw new Error(`Erro retornado pelo Senior GetDBInfo: ${erro[1].trim()}`);
  }

  const retorno = soap.match(/<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/i);
  if (!retorno) {
    throw new Error('O campo pmReturnGetDBInfo não foi encontrado na resposta SOAP.');
  }

  const base64 = retorno[1].replace(/\s+/g, '').trim();
  if (!base64) {
    throw new Error('O GetDBInfo retornou pmReturnGetDBInfo vazio.');
  }

  return {
    json: {
      ...cabecalho,
      fornecedorXml: Buffer.from(base64, 'base64').toString('latin1'),
    },
  };
});
}
