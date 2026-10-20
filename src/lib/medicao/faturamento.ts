// Faturamento (notas fiscais de servico e notas de debito) direto do Senior, por centro de custo e mes -- para conferir com a medicao dos pedidos.
// So' calculo (sem banco e sem Senior). Metodo do Rito de Gestao, ja validado contra a planilha do financeiro (346 de 353 NFs e 108 de 108 NDs de 2025 em
// diante casam com o Senior em valor e data):
//   NF  = E140NFV (SITNFV 1 ou 2; a 3 e' "cancelada e reemitida" e a substituta ja esta na lista), valor bruto VLRBSE.
//         Centro de custo = rateio do(s) titulo(s) da nota (E301TCR por FILNFV/CODSNF/NUMNFV -> E301RAT); sem titulo, o CCU dos itens da nota (E140ISV).
//   ND  = E301TCR com CODTPT = 'ND', valor VLRORI, rateio em E301RAT (ou o CCU do proprio titulo).
//   NF ligada a pedido pelo Senior (E140ISV.NUMPED): pertence ao CENTRO DE CUSTO PRINCIPAL DO CONTRATO DO PEDIDO, nao ao rateio do titulo. O Senior reparte alguns
//   titulos entre centros de custo de forma diferente do pedido (NF 105: R$ 106.089,36 no CC 160 e R$ 12.210,64 no CC 190 do MRN, mas a nota inteira e' o pedido 205
//   da AGA QZ); a nota e' do contrato do pedido.
//   Mes de cada documento: se a nota nasceu de um pedido (E140ISV.NUMPED) vale o mes desse pedido (boletim); senao a regra da emissao do Rito
//   (emissao menos 1 mes, corte de dia por contrato). A origem fica marcada em cada documento, nunca se passa regra por boletim.

import { COMPETENCIA_ACUMULADO, competenciaPorEmissao } from "./competencia";
import { numero, type ItemMedicao, type Linha } from "./montagem";

export type EntradaFaturamento = {
  notas: Linha[]; // E140NFV: CODFIL, CODSNF, NUMNFV, DATEMI, CODCLI, VLRBSE (bruto), VLRLIQ (liquido, depois das retencoes), SITNFV
  itensNota: Linha[]; // E140ISV: CODFIL, CODSNF, NUMNFV, NUMPED, SEQISP, CODCCU, VLRBRU
  titulos: Linha[]; // E301TCR: NUMTIT, CODFIL, CODTPT, CODCLI, SITTIT, DATEMI, VLRORI, CODCCU, FILNFV, CODSNF, NUMNFV
  rateios: Linha[]; // E301RAT: NUMTIT, CODFIL, CODCCU, PERRAT, VLRRAT
};

export type DocFaturamento = {
  chave: string; tipo: "NF" | "ND"; numero: string; filial: string; serie: string | null; dataEmissao: string; // aaaa-mm-dd
  duplicadaDe?: string | null; // numero da nota que vale quando esta e' duplicada (mesmo cliente, data, valor e centro de custo; uma paga e outra em aberto): nao conta na receita
  codccuOriginal: string | null; // quando a nota foi levada para o contrato do pedido de mesmo valor (ver reatribuicao.ts): o centro de custo que o Senior tinha
  valor: number; // BRUTO, a parte deste centro de custo
  valorLiquido: number; // liquido da parte (NF: depois das retencoes, E140NFV.VLRLIQ; ND: sem retencao, igual ao bruto)
  valorDoc: number; // valor bruto total do documento
  codccu: string | null; competencia: string; origem: "PEDIDO" | "EMISSAO" | "ACUMULADO"; pedidos: string | null; situacao: string | null; codCli: string | null;
};

const texto = (t: string | undefined | null) => String(t ?? "").trim();
const arred = (v: number) => Math.round(v * 100) / 100 || 0; // "|| 0" evita o -0
const dataIso = (br: string | undefined): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto(br));
  return m && m[3] !== "1900" ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Reparte o valor do documento entre os centros de custo, na proporcao dos pesos; a ultima parte absorve o centavo que sobrar. */
function repartir(valor: number, pesos: Map<string, number>): { ccu: string | null; valor: number }[] {
  const itens = [...pesos.entries()].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  const total = itens.reduce((s, [, p]) => s + p, 0);
  if (itens.length === 0 || total <= 0) return [{ ccu: null, valor }];
  let resto = valor;
  return itens.map(([ccu, p], i) => {
    const parte = i === itens.length - 1 ? arred(resto) : arred((valor * p) / total);
    resto -= parte;
    return { ccu: ccu || null, valor: parte };
  });
}

/** Competencia de cada pedido, tirada dos itens ja montados da medicao (a mais frequente por valor). */
export function competenciaPorPedido(itens: Pick<ItemMedicao, "numPed" | "competencia" | "origem" | "valor">[]): Map<string, { competencia: string; origem: ItemMedicao["origem"] }> {
  const acc = new Map<string, Map<string, { v: number; origem: ItemMedicao["origem"] }>>();
  for (const i of itens) {
    const m = acc.get(i.numPed) ?? new Map<string, { v: number; origem: ItemMedicao["origem"] }>();
    const x = m.get(i.competencia) ?? { v: 0, origem: i.origem };
    x.v += Math.abs(i.valor) + 0.01;
    m.set(i.competencia, x);
    acc.set(i.numPed, m);
  }
  const r = new Map<string, { competencia: string; origem: ItemMedicao["origem"] }>();
  for (const [ped, m] of acc) {
    const [comp, x] = [...m.entries()].sort((a, b) => b[1].v - a[1].v)[0];
    r.set(ped, { competencia: comp, origem: x.origem });
  }
  return r;
}

export function montarFaturamento(e: EntradaFaturamento, itensMedicao: Pick<ItemMedicao, "numPed" | "competencia" | "origem" | "valor" | "numCtr">[], contratos: { numCtr: string; codccu: string | null }[] = []): DocFaturamento[] {
  const compPed = competenciaPorPedido(itensMedicao);
  // centro de custo principal do contrato de cada pedido, ponderado pelo valor dos itens
  const ccuDoContrato = new Map(contratos.map((c) => [c.numCtr, c.codccu]));
  const ccuDoPedido = new Map<string, Map<string, number>>();
  for (const i of itensMedicao) {
    const ccu = ccuDoContrato.get(i.numCtr);
    if (!ccu || i.valor <= 0) continue;
    const m = ccuDoPedido.get(i.numPed) ?? new Map<string, number>();
    m.set(ccu, (m.get(ccu) ?? 0) + i.valor);
    ccuDoPedido.set(i.numPed, m);
  }
  const docs: DocFaturamento[] = [];
  const liquidadas = new Map<string, boolean>(); // nota com titulo liquidado (paga)

  // rateio dos titulos: uma linha por (titulo, centro de custo) -- o Senior repete linhas quase identicas, ficamos com a ultima (mesmo criterio do Rito)
  const rateioDoTitulo = new Map<string, Map<string, number>>();
  for (const r of e.rateios) {
    const k = `${texto(r.CODFIL)}|${texto(r.NUMTIT)}`;
    const m = rateioDoTitulo.get(k) ?? new Map<string, number>();
    m.set(texto(r.CODCCU), numero(r.VLRRAT));
    rateioDoTitulo.set(k, m);
  }
  const titulosDaNota = new Map<string, Linha[]>();
  for (const t of e.titulos) {
    if (texto(t.NUMNFV) === "0" || !texto(t.NUMNFV)) continue;
    const k = `${texto(t.FILNFV)}|${texto(t.CODSNF)}|${texto(t.NUMNFV)}`;
    const l = titulosDaNota.get(k) ?? [];
    l.push(t);
    titulosDaNota.set(k, l);
  }
  const itensDaNota = new Map<string, Linha[]>();
  for (const i of e.itensNota) {
    const k = `${texto(i.CODFIL)}|${texto(i.CODSNF)}|${texto(i.NUMNFV)}`;
    const l = itensDaNota.get(k) ?? [];
    l.push(i);
    itensDaNota.set(k, l);
  }

  for (const n of e.notas) {
    const sit = texto(n.SITNFV);
    if (sit !== "1" && sit !== "2") continue; // 3 = cancelada e reemitida (a substituta ja esta aqui)
    const valorDoc = arred(numero(n.VLRBSE));
    const liquidoDoc = arred(numero(n.VLRLIQ)) > 0 ? arred(numero(n.VLRLIQ)) : valorDoc; // sem liquido no Senior: igual ao bruto
    const emissao = dataIso(n.DATEMI);
    if (valorDoc <= 0 || !emissao) continue; // rascunho sem valor
    const k = `${texto(n.CODFIL)}|${texto(n.CODSNF)}|${texto(n.NUMNFV)}`;
    const pesos = new Map<string, number>();
    for (const t of titulosDaNota.get(k) ?? []) for (const [c, v] of rateioDoTitulo.get(`${texto(t.CODFIL)}|${texto(t.NUMTIT)}`) ?? []) pesos.set(c, (pesos.get(c) ?? 0) + v);
    if (pesos.size === 0) for (const i of itensDaNota.get(k) ?? []) pesos.set(texto(i.CODCCU), (pesos.get(texto(i.CODCCU)) ?? 0) + numero(i.VLRBRU));
    const peds = [...new Set((itensDaNota.get(k) ?? []).map((i) => texto(i.NUMPED)).filter((p) => p && p !== "0"))];
    // nota ligada a pedido: o centro de custo e' o do contrato do pedido (nao o do rateio do titulo)
    const pesosDoPedido = new Map<string, number>();
    for (const p of peds) for (const [ccu, v] of ccuDoPedido.get(p) ?? []) pesosDoPedido.set(ccu, (pesosDoPedido.get(ccu) ?? 0) + v);
    if (pesosDoPedido.size > 0) { pesos.clear(); for (const [ccu, v] of pesosDoPedido) pesos.set(ccu, v); }
    const doPedido = peds.map((p) => compPed.get(p)).find(Boolean);
    const liquidada = (titulosDaNota.get(k) ?? []).some((t) => texto(t.SITTIT) === "LQ");
    for (const parte of repartir(valorDoc, pesos)) {
      let competencia: string, origem: DocFaturamento["origem"];
      if (doPedido) { competencia = doPedido.competencia; origem = doPedido.competencia === COMPETENCIA_ACUMULADO ? "ACUMULADO" : "PEDIDO"; }
      else { competencia = competenciaPorEmissao(emissao, parte.ccu) ?? emissao.slice(0, 7); origem = "EMISSAO"; }
      liquidadas.set(`NF|${k}|${parte.ccu ?? ""}`, liquidada);
      docs.push({ chave: `NF|${k}|${parte.ccu ?? ""}`, tipo: "NF", numero: texto(n.NUMNFV), filial: texto(n.CODFIL), serie: texto(n.CODSNF) || null, dataEmissao: emissao, codccuOriginal: null, valor: parte.valor, valorLiquido: arred((liquidoDoc * parte.valor) / valorDoc), valorDoc, codccu: parte.ccu, competencia, origem, pedidos: peds.length ? peds.join(",") : null, situacao: sit === "2" ? "AUTORIZADA" : "EM ELABORACAO", codCli: texto(n.CODCLI) || null });
    }
  }

  for (const t of e.titulos) {
    if (texto(t.CODTPT) !== "ND" || texto(t.SITTIT) === "CA") continue;
    const valorDoc = arred(numero(t.VLRORI));
    const emissao = dataIso(t.DATEMI);
    if (valorDoc <= 0 || !emissao) continue;
    const pesos = new Map(rateioDoTitulo.get(`${texto(t.CODFIL)}|${texto(t.NUMTIT)}`) ?? []);
    if (pesos.size === 0 && texto(t.CODCCU)) pesos.set(texto(t.CODCCU), valorDoc);
    for (const parte of repartir(valorDoc, pesos)) {
      docs.push({ chave: `ND|${texto(t.CODFIL)}|${texto(t.NUMTIT)}|${parte.ccu ?? ""}`, tipo: "ND", numero: texto(t.NUMTIT), filial: texto(t.CODFIL), serie: null, dataEmissao: emissao, codccuOriginal: null, valor: parte.valor, valorLiquido: parte.valor, valorDoc, codccu: parte.ccu, competencia: competenciaPorEmissao(emissao, parte.ccu) ?? emissao.slice(0, 7), origem: "EMISSAO", pedidos: null, situacao: texto(t.SITTIT) === "LQ" ? "LIQUIDADA" : "EM ABERTO", codCli: texto(t.CODCLI) || null });
    }
  }
  marcarDuplicadas(docs, liquidadas);
  return docs;
}

/**
 * Nota duplicada conta UMA vez. Duplicada = mesmo cliente, mesma data de emissao, mesmo valor e mesmo centro de custo, com uma nota paga e outra ainda em aberto
 * (a paga vale; ex.: PM Contagem, NF 149 paga e NF 132 em aberto, R$ 22.745,88 em 31/08/2025), ou todas em aberto (vale a de menor numero). Notas iguais mas TODAS pagas
 * sao notas reais (dois pagamentos recebidos: NF 27 e 29 da SUDECAP, R$ 75.745,52) e ficam. A duplicada fica na lista, marcada, e nao entra na receita.
 */
function marcarDuplicadas(docs: DocFaturamento[], liquidadas: Map<string, boolean>) {
  const grupos = new Map<string, DocFaturamento[]>();
  for (const d of docs) {
    if (d.tipo !== "NF") continue;
    const k = `${d.codCli}|${d.dataEmissao}|${d.valorDoc}|${d.codccu}`;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const pagas = lista.filter((d) => liquidadas.get(d.chave));
    const abertas = lista.filter((d) => !liquidadas.get(d.chave));
    if (pagas.length > 0) { for (const d of abertas) d.duplicadaDe = pagas[0].numero; continue; } // paga vale; so' as pagas ficam
    const vale = [...lista].sort((a, b) => Number(a.numero) - Number(b.numero))[0]; // todas em aberto: vale a de menor numero
    for (const d of lista) if (d !== vale) d.duplicadaDe = vale.numero;
  }
}

/**
 * Contrato com linhas e SEM pedido (nao tem como descobrir o centro de custo pelos itens) recebe o centro de custo pelas notas: o codigo do CLIENTE da nota (E301TCR/E140NFV.CODCLI)
 * igual ao do contrato (E160CTR.CODCLI), num centro de custo que nenhum outro contrato usa, e desde que seja um so' contrato e um so' centro de custo nessa condicao.
 * Nunca pelo nome. Exemplo: MACFROTAS CT 4336/2026 (cliente 711682): duas NDs de aluguel de veiculos (R$ 177.210) no CC 102325, sem nenhum pedido de medicao.
 */
export function ccuDosContratosSemPedido<T extends { numCtr: string; codCli: string | null; codccu: string | null }>(contratos: T[], docs: DocFaturamento[]): { numCtr: string; codccu: string }[] {
  const usados = new Set(contratos.map((c) => c.codccu).filter((x): x is string => !!x));
  const atribuidos: { numCtr: string; codccu: string }[] = [];
  const semCcu = contratos.filter((c) => !c.codccu && c.codCli);
  for (const c of semCcu) {
    if (semCcu.filter((o) => o.codCli === c.codCli).length !== 1) continue; // cliente com mais de um contrato sem centro de custo: ambiguo
    const ccus = new Set(docs.filter((d) => d.codCli === c.codCli && d.codccu && !usados.has(d.codccu) && !d.duplicadaDe).map((d) => d.codccu!));
    if (ccus.size !== 1) continue;
    const codccu = [...ccus][0];
    (c as { codccu: string | null }).codccu = codccu;
    usados.add(codccu);
    atribuidos.push({ numCtr: c.numCtr, codccu });
  }
  return atribuidos;
}
