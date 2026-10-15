// @ts-nocheck
// No Code do workflow n8n "Consolidar Blocos OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// CONSOLIDAR BLOCOS OC V2
// Busca direta dos blocos principais
// ============================================================


// Função para capturar nó anterior
function buscar(nome){

    try {

        return $(nome)
            .all()
            .map(i=>i.json);

    } catch(e){

        return [];

    }

}



// ============================================================
// CAPTURA DOS BLOCOS
// ============================================================


const identificacao =
    buscar("Normalizar Cabeçalho OC")[0]
    ||
    {};



const ordemCompra =
    buscar("Normalizar Cabeçalho OC")[0]
    ||
    {};



const produtos =
    buscar("Normalizar Produtos OC")
    .flatMap(x =>
        x.produtos || []
    );



const servicos =
    buscar("Normalizar Serviços OC")
    .flatMap(x =>
        x.servicos || []
    );



const rateios =
    buscar("Normalizar Rateios OC")
    .flatMap(x =>
        x.rateios || []
    );



const aprovacao =
    buscar("Normalizar Cadastro Aprovadores")[0]
    ||
    {};



const financeiro =
    buscar("Normalizar Títulos Financeiros")[0]
    ||
    {};



const historicoFornecedor =
    buscar("Consolidar Histórico Pagamento Fornecedor")[0]
    ||
    buscar("Consolidar Histórico Pagamento Analítico")[0]
    ||
    {};




// ============================================================
// ALERTAS
// ============================================================


const alertas=[];


if(
    Object.keys(ordemCompra).length===0
){

    alertas.push({

        codigo:
        "OC_NAO_ENCONTRADA",

        nivel:
        "ALTO"

    });

}



if(
    Object.keys(financeiro).length===0
){

    alertas.push({

        codigo:
        "FINANCEIRO_NAO_ENCONTRADO",

        nivel:
        "MEDIO"

    });

}



// ============================================================
// SAÍDA
// ============================================================


return [

{

json:{


identificacao,


ordemCompra,


produtos,


servicos,


rateios,


aprovacao,


financeiro,


historicoFornecedor,


alertas,


meta:{

etapa:
"CONSOLIDAR_BLOCOS_OC_V2",

origem:
"Senior ERP"

}



}

}

];
}
