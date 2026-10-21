// "O que o Senior mostra neste mes": para um mes em que a medicao (pedidos) e as notas nao fecham, lista os FATOS lidos do Senior -- cada nota sem pedido ligado
// (numero, filial, serie, data, valor) e cada pedido do mes (numero, boletim, data em que foi aberto, itens, valor) -- e a diferenca. Nada e' deduzido nem alterado:
// a nota conta na receita, o pedido fica como esta no Senior. A tela mostra isto ao clicar no mes.

import type { Conciliacao } from "./conciliacao";

export type LinhaOrigem = { titulo: string; texto: string };
export type OrigemDoMes = { notas: LinhaOrigem[]; pedidos: LinhaOrigem[]; resumo: string };

const TOL = 0.05;
const moedaBr = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const rot = (d: { tipo: string; numero: string }) => (d.tipo === "ND" && /^ND/i.test(d.numero) ? d.numero : `${d.tipo} ${d.numero}`);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** null = o mes fecha (nada a explicar) ou nao existe no periodo. */
export function origemNoSenior(c: Conciliacao, mes: string): OrigemDoMes | null {
  const m = c.meses.find((x) => x.mes === mes);
  if (!m || Math.abs(m.dif) < TOL) return null;

  const notasSem = c.docs.filter((d) => d.competencia === mes && !d.vinculo && !d.duplicadaDe);
  const pedidosMes = c.pedidos.filter((p) => p.competencia === mes && p.valor > TOL);
  const pedidosSemNota = pedidosMes.filter((p) => p.documentos.length === 0);

  const notas: LinhaOrigem[] = notasSem.map((d) => {
    const onde = d.tipo === "NF" ? `${d.filial !== "1" ? `filial ${d.filial}, ` : ""}${d.serie ? `série ${d.serie}, ` : ""}` : "";
    const ligacao = d.tipo === "ND"
      ? "nota de débito (reembolsável) sem pedido ligado"
      : d.pedidos
        ? `cita o pedido ${d.pedidos}, que não é da medição deste contrato`
        : "emitida direto no faturamento, sem pedido de venda ligado a ela";
    return { titulo: rot(d), texto: `${onde}emitida em ${dataBr(d.dataEmissao)}, ${moedaBr(d.valorDoc)}: ${ligacao}.` };
  });

  // dif < 0: a nota passou do pedido -> mostra todos os pedidos do mes; dif > 0: so' os pedidos que ainda nao tem nota
  const listaPedidos = m.dif < 0 ? pedidosMes : pedidosSemNota;
  const pedidos: LinhaOrigem[] = listaPedidos.map((p) => ({
    titulo: `Pedido ${p.numPed}`,
    texto: `${p.boletins.length ? `boletim ${p.boletins.join(", ")}, ` : ""}aberto em ${dataBr(p.emissao)}, ${plural(p.itens, "item", "itens")}, ${moedaBr(p.valor)}${p.documentos.length ? `, ligado à ${p.documentos.map(rot).join(" + ")}` : m.dif > 0 ? ", sem nota fiscal emitida no Senior" : ", sem nota ligada"}.`,
  }));

  const somaNotas = notasSem.filter((d) => d.tipo === "NF").reduce((s, d) => s + d.valor, 0);
  const somaPedidos = pedidosSemNota.reduce((s, p) => s + p.valor, 0);
  let resumo: string;
  if (m.dif < 0) {
    if (pedidosMes.length === 0) resumo = `Não há pedido de medição deste mês no Senior. As notas fiscais somam ${moedaBr(somaNotas)} e contam na receita.`;
    else if (somaPedidos < somaNotas * 0.05) resumo = `Notas fiscais sem pedido ligado: ${moedaBr(somaNotas)}. Linhas dos pedidos do mês no Senior: ${moedaBr(somaPedidos)}. Faltam ${moedaBr(-m.dif)} de medição por lançar nas linhas dos pedidos; as notas contam na receita.`;
    else resumo = `Notas fiscais sem pedido ligado: ${moedaBr(somaNotas)}. Pedidos do mês sem nota: ${moedaBr(somaPedidos)}. A nota está ${moedaBr(-m.dif)} acima do pedido; o pedido segue como está no Senior e a nota conta na receita.`;
  } else {
    resumo = `Medido nos pedidos e sem nota fiscal: ${moedaBr(m.dif)}. Esse valor conta na receita, marcado como sem nota, até a nota ser emitida no Senior.`;
  }
  return { notas, pedidos, resumo };
}
