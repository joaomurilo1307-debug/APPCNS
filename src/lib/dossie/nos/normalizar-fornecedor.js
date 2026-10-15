// @ts-nocheck
// No Code do workflow n8n "Normalizar Fornecedor" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// NORMALIZAR FORNECEDOR (E075FOR)
//
// Entrega o cadastro do fornecedor — código + razão social + CNPJ —
// que até então não existia em nenhum ponto do fluxo. O item de
// entrada (cabeçalho da OC) é repassado intacto, então este nó pode
// ficar em série sem quebrar os nós seguintes.
// ============================================================

const items = $input.all();

function getTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return null;
  const v = m[1].trim();
  return v === '' ? null : v;
}

/** 41345488000176 -> 41.345.488/0001-76 ; CPF -> 000.000.000-00 */
function formatarDocumento(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return d || null;
}

function montarExtenso(codigo, nome) {
  const temCodigo = codigo !== null && codigo !== undefined && codigo !== '';
  const temNome = nome !== null && nome !== undefined && String(nome).trim() !== '';
  if (temCodigo && temNome) return `${codigo} - ${String(nome).trim()}`;
  if (temNome) return String(nome).trim();
  if (temCodigo) return String(codigo);
  return null;
}

return items.map((item) => {
  const entrada = item.json || {};
  const xml = entrada.fornecedorXml || '';

  const codigoRetornado = getTag(xml, 'CODFOR');
  const codigoOC = entrada.ordemCompra?.fornecedor?.codigo ?? null;
  const codigo =
    codigoRetornado !== null ? Number(codigoRetornado) : codigoOC;

  const razaoSocial = getTag(xml, 'NOMFOR');
  const nomeFantasia = getTag(xml, 'APEFOR');
  const documento = getTag(xml, 'CGCCPF');
  const inscricaoEstadual = getTag(xml, 'INSEST');

  const fornecedor = {
    codigo,
    razaoSocial,
    nomeFantasia,
    cnpj: documento ? String(documento).replace(/\D/g, '') : null,
    cnpjFormatado: formatarDocumento(documento),
    inscricaoEstadual,
    extenso: montarExtenso(codigo, razaoSocial || nomeFantasia),
    encontrado: razaoSocial !== null,
    origem: { tabela: 'E075FOR', campo: 'NOMFOR' },
  };

  // O cabeçalho segue adiante intacto, agora com o fornecedor por extenso.
  const ordemCompra = {
    ...(entrada.ordemCompra || {}),
    fornecedor: {
      ...(entrada.ordemCompra?.fornecedor || {}),
      ...fornecedor,
    },
  };

  const { fornecedorXml, ...resto } = entrada;

  return {
    json: {
      ...resto,
      ordemCompra,
      fornecedor,
      meta: {
        ...(entrada.meta || {}),
        etapa: 'NORMALIZAR_FORNECEDOR',
      },
    },
  };
});
}
