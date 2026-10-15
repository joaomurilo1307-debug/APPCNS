// @ts-nocheck
// No Code do workflow n8n "Preparar Aprovadores" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const item = $input.first().json;

const aprovacao = item.aprovacaoMultinivel || {};

const empresa = aprovacao.empresa;
const usuarios = aprovacao.usuariosAprovadores || [];

return usuarios.map(codUsu => ({
  json: {
    codEmp: empresa,
    codUsu
  }
}));
}
