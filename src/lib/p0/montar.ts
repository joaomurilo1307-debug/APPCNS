// P0 de custo de contrato no mesmo formato das contas da tela Custo por Contrato (ContaDoContrato): as telas do P0 e o comparativo com o
// realizado usam as mesmas agregacoes. So' reorganiza as linhas da planilha da area (conta x mes); nada e' estimado.

import type { ContaDoContrato } from "../custos/agregacao";

export type LinhaP0 = {
  codConta: number | null;
  conta: string;
  grupoCodigo: string;
  grupoNome: string;
  reembolsavel: boolean;
  competencia: Date;
  valor: number;
};

export type P0Custos = {
  codccu: string;
  versao: number;
  rotulo: string;
  origem: string | null;
  rotuloNaPlanilha: string | null;
  /** primeiro e ultimo mes com previsao ("aaaa-mm") */
  mesIni: string;
  mesFim: string;
  totalCusto: number;
  /** soma do P0 de custos pessoais do contrato (salario CLT, encargos, ferias, 13o, provisoes): so' o total, para a ponte com o P0 inteiro */
  totalPessoal?: number;
  contas: ContaDoContrato[];
};

export type P0Resposta = ({ existe: true } & P0Custos) | { existe: false };

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Linhas do P0 -> uma conta por conta do plano, com a serie mensal (varias linhas da mesma conta no mes somam). Maior conta primeiro. */
export function contasDoP0(linhas: ReadonlyArray<LinhaP0>): ContaDoContrato[] {
  const porConta = new Map<string, { base: LinhaP0; meses: Map<string, number> }>();
  for (const l of linhas) {
    const chave = `${l.codConta ?? "x"}|${l.conta}`;
    const e = porConta.get(chave) ?? { base: l, meses: new Map<string, number>() };
    const mes = `${l.competencia.toISOString().slice(0, 7)}-01T00:00:00.000Z`;
    e.meses.set(mes, (e.meses.get(mes) ?? 0) + l.valor);
    porConta.set(chave, e);
  }
  return Array.from(porConta.values())
    .map(({ base, meses }) => {
      const serie = Array.from(meses.entries())
        .map(([competencia, valor]) => ({ competencia, valor: centavos(valor) }))
        .sort((a, b) => a.competencia.localeCompare(b.competencia));
      return {
        contaFinanceira: base.conta,
        codigo: base.codConta,
        grupoCodigo: base.grupoCodigo,
        grupoNome: base.grupoNome,
        reembolsavel: base.reembolsavel,
        inativa: false,
        total: centavos(serie.reduce((s, m) => s + m.valor, 0)),
        meses: serie,
      };
    })
    .sort((a, b) => b.total - a.total || a.contaFinanceira.localeCompare(b.contaFinanceira, "pt-BR"));
}

/** Primeiro e ultimo mes com previsao, ou null quando o P0 nao tem linha. */
export function periodoDoP0(contas: ReadonlyArray<ContaDoContrato>): { mesIni: string; mesFim: string } | null {
  let ini: string | null = null;
  let fim: string | null = null;
  for (const c of contas)
    for (const m of c.meses) {
      const k = m.competencia.slice(0, 7);
      if (ini === null || k < ini) ini = k;
      if (fim === null || k > fim) fim = k;
    }
  return ini && fim ? { mesIni: ini, mesFim: fim } : null;
}

/** Todos os meses de `de` ate `ate` (inclusive), sem pular nenhum -- um mes sem previsao no meio do P0 (pausa) aparece com zero. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [aFim, mFim] = ate.split("-").map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}
