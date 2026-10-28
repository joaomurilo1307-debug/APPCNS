// Validacao da carga do custo de pessoal (PURO): o que a rota de sincronizacao recusa. Recusa a carga INTEIRA se algo estiver errado, para nunca
// gravar uma folha pela metade (a carga substitui os meses enviados).

import { totalDoRito, type Componentes } from "./componentes";

export type ItemDaCarga = { codccu: string; mes: string; matricula: string; total: number } & Pick<Componentes, "liquido" | "rescisao" | "inss" | "fgts" | "irrf" | "provFerias" | "provTerco" | "prov13" | "provInss" | "provFgts">;

export function problemasDaCarga(meses: ReadonlyArray<string>, itens: ReadonlyArray<ItemDaCarga>): string[] {
  const permitidos = new Set(meses);
  const chaves = new Set<string>();
  const problemas: string[] = [];
  for (const i of itens) {
    if (!permitidos.has(i.mes)) problemas.push(`${i.matricula} ${i.mes}: mês fora da lista de meses enviada`);
    if (!/^\d{1,9}$/.test(i.codccu)) problemas.push(`${i.matricula} ${i.mes}: centro de custo "${i.codccu}" inválido (use o código numérico do sistema)`);
    const k = `${i.codccu}|${i.mes}|${i.matricula}`;
    if (chaves.has(k)) problemas.push(`${i.matricula} ${i.mes}: linha repetida no centro ${i.codccu}`);
    chaves.add(k);
    const calculado = totalDoRito(i);
    if (Math.abs(calculado - i.total) > 0.02) problemas.push(`${i.matricula} ${i.mes}: total ${i.total} não bate com os componentes (${calculado})`);
  }
  return problemas;
}
