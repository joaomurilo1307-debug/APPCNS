import type { DadosSeniorDoTitulo } from "../senior/dadosPagamentoTitulos";
import { montarConteudoPagamento, type ConteudoPagamento } from "./conteudoPagamento";

export type TituloConferencia = { id?: string; numTit: string; codFpg?: string | null; formaPagamento?: string | null };
export type ItemConferencia = {
  id: string; numTit: string; codFpg: string | null; formaPagamento: string | null;
  documento: string | null; conteudo: ConteudoPagamento;
  origemConta: string | null; origemPix: string | null; divergencia: string | null;
};

// A conferencia usa a resposta da mesma consulta do carrinho Itau, sem
// transformar a forma digitada na OC na forma de todos os titulos.
export function montarConferenciaPagamento(titulos: TituloConferencia[], dados: DadosSeniorDoTitulo[]) {
  const porId = new Map(dados.map(d => [d.tituloId, d]));
  const itens: ItemConferencia[] = [];
  const naoConferidos: string[] = [];
  for (const t of titulos) {
    const d = t.id ? porId.get(t.id) : undefined;
    if (!d?.achouNoSenior) { naoConferidos.push(t.numTit); continue; }
    const codFpg = d.codFpgTitulo !== undefined ? d.codFpgTitulo : d.codFpg;
    const formaPagamento = d.codFpgTitulo !== undefined ? d.formaPagamentoTitulo ?? null : d.formaPagamento;
    const conta = d.conta, pix = d.chavePix;
    const entrada = {
      codFpg, formaPagamento, oc: null,
      titulos: [{ numTit: t.numTit, codigoBarras: d.codigoBarras, chavePix: pix?.valor,
        tipoChavePix: pix ? String(Number(pix.tipo)) : null,
        banco: conta?.banco, agencia: conta?.agencia, conta: conta?.conta, dac: conta?.dac }],
    };
    const conteudo = montarConteudoPagamento(entrada);
    // Mostra os dados efetivamente encontrados, inclusive PIX por conta.
    // A forma continua sendo exclusivamente a do titulo.
    const todos = montarConteudoPagamento({ ...entrada, codFpg: null, formaPagamento: null });
    conteudo.itens = todos.itens;
    if (todos.itens.length) conteudo.erro = null;
    const diferenca = t.codFpg && codFpg && Number(t.codFpg) !== Number(codFpg);
    itens.push({ id: t.id!, numTit: t.numTit, codFpg, formaPagamento,
      documento: d.documento, conteudo, origemConta: conta?.fonte ?? null, origemPix: pix?.fonte ?? null,
      divergencia: diferenca ? `O titulo ${t.numTit} esta na forma ${codFpg} na Senior; a ultima sincronizacao local mostrava ${t.codFpg}. A conferencia utiliza a consulta atual.` : null,
    });
  }
  return { itens, naoConferidos };
}
