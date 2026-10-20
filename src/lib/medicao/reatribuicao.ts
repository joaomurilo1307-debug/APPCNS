// Nota lancada no centro de custo de OUTRO contrato (rateio do titulo diferente do pedido): leva a nota para o contrato do pedido de mesmo valor.
// O Senior e' a unica fonte, e a regra e' so' esta, sem lista manual de notas: a nota nao casou com nenhum pedido do proprio centro de custo E existe, em outro
// contrato, um pedido sem nota com o MESMO valor ao centavo (R$ 1.000 ou mais, ate 12 meses de distancia, o mais proximo em mes). O Rito de Gestao ja faz isso
// para duas notas, a mao (titulos 16A1 e 277$01); aqui vale para todas e fica registrado o centro de custo que o Senior tinha (codccuOriginal).
// Exemplos reais: NF 16 (R$ 229.215,93) no CC 170 (AGA MSG) e o pedido 380 no CC 102185 (AGA 15140 CB); NF 216 (R$ 453.400,04) no CC 190 (MRN 3748) e o pedido 251
// no CC 210 (MRN 3686): a planilha do financeiro tambem coloca a NF 216 no MRN 3686.

import { conciliar, type DocConc } from "./conciliacao";
import type { DocFaturamento } from "./faturamento";
import type { ItemMedicao } from "./montagem";

export type Reatribuicao = { chave: string; tipo: "NF" | "ND"; numero: string; valor: number; deCcu: string; paraCcu: string; pedido: string };

export function reatribuirNotasPorValor(docs: DocFaturamento[], itens: ItemMedicao[], contratos: { numCtr: string; codccu: string | null }[]): { docs: DocFaturamento[]; reatribuidas: Reatribuicao[] } {
  const grupos = new Map<string, string[]>();
  for (const c of contratos) if (c.codccu) grupos.set(c.codccu, [...(grupos.get(c.codccu) ?? []), c.numCtr]);
  const conc = (d: DocFaturamento): DocConc => d;
  const rodadas = [...grupos.entries()].map(([ccu, nums]) => {
    const dosItens = itens.filter((i) => nums.includes(i.numCtr));
    const r = conciliar(dosItens, docs.filter((d) => d.codccu === ccu).map(conc), docs.filter((d) => d.codccu && d.codccu !== ccu).map(conc), "2024-01", "2026-12");
    return { ccu, r };
  });
  // nota que ficou sem pedido no proprio centro de custo (nem vinculo do Senior, nem mesmo valor, nem soma)
  const semPedido = new Set<string>();
  for (const { r } of rodadas) for (const d of r.docs) if (!d.vinculo && !d.duplicadaDe && d.competencia !== "0000-00") semPedido.add(d.chave);
  for (const d of docs) if (d.codccu && !grupos.has(d.codccu) && d.competencia !== "0000-00") semPedido.add(d.chave); // centro de custo sem nenhum pedido: nenhuma nota dele casa com pedido
  const candidatos: { alvo: string; chave: string; pedido: string; valor: number; dist: number }[] = [];
  for (const { ccu, r } of rodadas) {
    for (const p of r.pedidos) {
      const o = p.possivelOutroCc;
      if (!o || !semPedido.has(o.chave)) continue;
      candidatos.push({ alvo: ccu, chave: o.chave, pedido: p.numPed, valor: o.valor, dist: Math.abs((Number(o.competencia.slice(0, 4)) * 12 + Number(o.competencia.slice(5, 7))) - (Number(p.competencia.slice(0, 4)) * 12 + Number(p.competencia.slice(5, 7)))) });
    }
  }
  candidatos.sort((a, b) => a.dist - b.dist || b.valor - a.valor);
  const usadas = new Set<string>(), alvos = new Map<string, { alvo: string; pedido: string }>();
  for (const c of candidatos) {
    if (usadas.has(c.chave)) continue; // uma nota so' vai para um pedido
    usadas.add(c.chave);
    alvos.set(c.chave, { alvo: c.alvo, pedido: c.pedido });
  }
  const reatribuidas: Reatribuicao[] = [];
  const saida = docs.map((d) => {
    const a = alvos.get(d.chave);
    if (!a || !d.codccu) return d;
    reatribuidas.push({ chave: d.chave, tipo: d.tipo, numero: d.numero, valor: d.valor, deCcu: d.codccu, paraCcu: a.alvo, pedido: a.pedido });
    return { ...d, codccuOriginal: d.codccu, codccu: a.alvo };
  });
  return { docs: saida, reatribuidas };
}
