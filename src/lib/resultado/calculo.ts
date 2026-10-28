// Resultado operacional (PURO, so' calculo): receita - custos, centro de custo a centro de custo, mes a mes, e somado por area ou pela empresa toda.
// Nada e' digitado: receita = Receita e Medicao (conciliacao.ts), custo = Custo por Centro de Custo (Senior, 90550+90558), pessoal = folha CLT do Senior.
//
//   Receita bruta          medicao faturada em NF + notas de debito + medido ainda sem nota (a mesma da aba Receita e Medicao)
//   (-) Retencoes          impostos retidos pelo cliente nas notas fiscais (PIS, COFINS, CSLL, IRRF, ISS...): NF bruta - NF liquida; nota de debito nao tem
//   = Receita liquida
//   (-) Custos             custo realizado do centro de custo no Senior (contas de pessoal e imposto ficam de fora, como na tela de custos)
//   (-) Custo de pessoal   folha CLT + encargos + provisoes (so' para quem tem o acesso restrito; sem ele o resultado e' "antes do pessoal")
//   = Resultado operacional;   margem = resultado / receita liquida   (a mesma regra da "margem real" do Rito de Gestao)
//
// O resultado pode ser visto pela receita BRUTA (opcao `liquida: false`): ai as retencoes nao entram na conta.

export type Area = "ENGENHARIA" | "AMBIENTAL" | "ADMINISTRATIVO";

export type FichaDoCentro = {
  codccu: string;
  nome: string;
  tipo: "CONTRATO" | "ADMINISTRATIVO";
  status: "ATIVO" | "ENCERRADO";
  area: Area | null;
  cliente: string | null;
  numero: string | null;
  objeto: string | null;
  vigenciaInicio: string | null; // aaaa-mm-dd
  vigenciaFim: string | null;
  valorContrato: number | null;
};

/** Series mensais de UM centro de custo, todas alinhadas aos mesmos `meses`. `pessoal` = null quando a pessoa nao tem o acesso restrito. */
export type SeriesDoCentro = {
  receita: number[];
  retencoes: number[];
  custo: number[];
  pessoal: number[] | null;
  semNota?: number[];
};

export type LinhaDoResultado = FichaDoCentro & SeriesDoCentro;

export type Opcoes = { liquida: boolean; comPessoal: boolean };

const arred = (v: number) => Math.round(v * 100) / 100 || 0;
export const soma = (xs: ReadonlyArray<number>) => arred(xs.reduce((s, x) => s + x, 0));
const zeros = (n: number) => Array.from({ length: n }, () => 0);

export type MesDoResultado = { receita: number; retencoes: number; receitaLiquida: number; custo: number; pessoal: number; resultado: number; margem: number | null };

/** Margem = resultado / receita considerada (liquida ou bruta); null sem receita (nao existe margem sobre zero). */
export const margemDe = (resultado: number, base: number): number | null => (Math.abs(base) < 0.005 ? null : resultado / base);

/** Um mes de um centro: aplica as opcoes (receita liquida ou bruta; com ou sem pessoal). */
export function mesDoCentro(s: SeriesDoCentro, i: number, o: Opcoes): MesDoResultado {
  const receita = s.receita[i] ?? 0;
  const retencoes = s.retencoes[i] ?? 0;
  const base = o.liquida ? arred(receita - retencoes) : receita;
  const custo = s.custo[i] ?? 0;
  const pessoal = o.comPessoal && s.pessoal ? s.pessoal[i] ?? 0 : 0;
  const resultado = arred(base - custo - pessoal);
  return { receita, retencoes, receitaLiquida: arred(receita - retencoes), custo, pessoal, resultado, margem: margemDe(resultado, base) };
}

export type Resumo = MesDoResultado & { base: number };

/** Soma de um periodo (indices dos meses) de um conjunto de centros. */
export function resumir(linhas: ReadonlyArray<SeriesDoCentro>, indices: ReadonlyArray<number>, o: Opcoes): Resumo {
  let receita = 0, retencoes = 0, custo = 0, pessoal = 0;
  for (const l of linhas) {
    for (const i of indices) {
      const m = mesDoCentro(l, i, o);
      receita += m.receita; retencoes += m.retencoes; custo += m.custo; pessoal += m.pessoal;
    }
  }
  receita = arred(receita); retencoes = arred(retencoes); custo = arred(custo); pessoal = arred(pessoal);
  const base = o.liquida ? arred(receita - retencoes) : receita;
  const resultado = arred(base - custo - pessoal);
  return { receita, retencoes, receitaLiquida: arred(receita - retencoes), custo, pessoal, resultado, margem: margemDe(resultado, base), base };
}

/** Series mensais somadas de varios centros (para a empresa ou para uma area). */
export function somarSeries(linhas: ReadonlyArray<SeriesDoCentro>, nMeses: number): SeriesDoCentro {
  const temPessoal = linhas.some((l) => l.pessoal);
  const soma1 = (f: (l: SeriesDoCentro) => number[] | null | undefined) =>
    Array.from({ length: nMeses }, (_, i) => arred(linhas.reduce((s, l) => s + (f(l)?.[i] ?? 0), 0)));
  return { receita: soma1((l) => l.receita), retencoes: soma1((l) => l.retencoes), custo: soma1((l) => l.custo), pessoal: temPessoal ? soma1((l) => l.pessoal) : null, semNota: soma1((l) => l.semNota) };
}

/** Resultado mes a mes de um conjunto de centros (ja somados): resultado, margem e acumulado. */
export function curvaDoResultado(s: SeriesDoCentro, nMeses: number, o: Opcoes) {
  const meses = Array.from({ length: nMeses }, (_, i) => mesDoCentro(s, i, o));
  let acc = 0;
  const acumulado = meses.map((m) => (acc = arred(acc + m.resultado)));
  return { meses, acumulado };
}

export type Selo = "prejuizo" | "acima" | "abaixo" | "sem-receita" | "sem-custo";

/** Classificacao RELATIVA (sem limite inventado): prejuizo, acima ou abaixo da margem da carteira, so' custo, so' receita. */
export function seloDoCentro(r: Resumo, margemCarteira: number | null): Selo {
  if (r.base === 0 && (r.custo + r.pessoal) > 0) return "sem-receita";
  if (r.base === 0) return "sem-custo";
  if (r.resultado < 0) return "prejuizo";
  if (margemCarteira === null || r.margem === null) return "abaixo";
  return r.margem >= margemCarteira ? "acima" : "abaixo";
}

export const ROTULO_SELO: Record<Selo, string> = {
  prejuizo: "Prejuízo",
  acima: "Acima da média",
  abaixo: "Abaixo da média",
  "sem-receita": "Só custo",
  "sem-custo": "Sem custo",
};

// ------------------------------------------------------------------------------------------------ agrupamentos

export type GrupoDoResultado = { id: string; rotulo: string; linhas: LinhaDoResultado[] };

export const ROTULO_AREA: Record<Area | "SEM", string> = { ENGENHARIA: "Engenharia", AMBIENTAL: "Ambiental", ADMINISTRATIVO: "Administrativo", SEM: "Sem área" };

export function agruparPorArea(linhas: ReadonlyArray<LinhaDoResultado>): GrupoDoResultado[] {
  const grupos = new Map<string, LinhaDoResultado[]>();
  for (const l of linhas) {
    const id = l.area ?? "SEM";
    (grupos.get(id) ?? grupos.set(id, []).get(id)!).push(l);
  }
  const ordem = ["ENGENHARIA", "AMBIENTAL", "ADMINISTRATIVO", "SEM"];
  return ordem.filter((id) => grupos.has(id)).map((id) => ({ id, rotulo: ROTULO_AREA[id as Area | "SEM"], linhas: grupos.get(id)! }));
}

/** Indices dos meses entre `de` e `ate` (inclusive). */
export const indicesDoPeriodo = (meses: ReadonlyArray<string>, de: string, ate: string): number[] => meses.flatMap((m, i) => (m >= de && m <= ate ? [i] : []));

// ------------------------------------------------------------------------------------------------ insights

export type Insight = { id: string; tom: "bom" | "atencao" | "alerta" | "info"; titulo: string; texto: string; codccu?: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesTxt = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)}/${m.slice(2, 4)}`;
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

/**
 * Leituras automaticas do periodo. So' afirma o que os numeros mostram; nada de limite de "bom" ou "ruim" inventado: compara com a propria carteira e com os meses anteriores.
 * `hoje` = aaaa-mm-dd; `mesParcial` = mes em andamento (fica fora das comparacoes entre meses).
 */
export function gerarInsights(
  linhas: ReadonlyArray<LinhaDoResultado>,
  meses: ReadonlyArray<string>,
  indices: ReadonlyArray<number>,
  o: Opcoes,
  hoje: string,
  mesParcial?: string,
): Insight[] {
  const out: Insight[] = [];
  const contratos = linhas.filter((l) => l.tipo === "CONTRATO");
  if (contratos.length === 0 || indices.length === 0) return out;
  const por = contratos.map((l) => ({ l, r: resumir([l], indices, o) }));
  const carteira = resumir(contratos, indices, o);

  // 1. contratos em prejuizo
  const prej = por.filter((x) => x.r.resultado < -0.005 && x.r.base > 0).sort((a, b) => a.r.resultado - b.r.resultado);
  if (prej.length) {
    out.push({
      id: "prejuizo", tom: "alerta", codccu: prej[0].l.codccu,
      titulo: `${prej.length} ${prej.length === 1 ? "contrato com prejuízo" : "contratos com prejuízo"} no período`,
      texto: `${prej.slice(0, 3).map((x) => `${x.l.nome} (${brl(x.r.resultado)})`).join("; ")}${prej.length > 3 ? ` e mais ${prej.length - 3}` : ""}. Somam ${brl(prej.reduce((s, x) => s + x.r.resultado, 0))}.`,
    });
  } else if (por.some((x) => x.r.base > 0)) {
    out.push({ id: "sem-prejuizo", tom: "bom", titulo: "Nenhum contrato com receita fechou o período no negativo", texto: "Todos os contratos com receita no período têm resultado positivo." });
  }

  // 2. concentracao do resultado positivo
  const positivos = por.filter((x) => x.r.resultado > 0).sort((a, b) => b.r.resultado - a.r.resultado);
  const totalPos = positivos.reduce((s, x) => s + x.r.resultado, 0);
  if (positivos.length >= 4 && totalPos > 0) {
    const top3 = positivos.slice(0, 3);
    const parte = top3.reduce((s, x) => s + x.r.resultado, 0) / totalPos;
    out.push({
      id: "concentracao", tom: parte >= 0.7 ? "atencao" : "info",
      titulo: `3 contratos geram ${pct(parte)} do resultado positivo`,
      texto: `${top3.map((x) => x.l.nome).join(", ")}. Dos ${positivos.length} contratos com resultado positivo, os outros ${positivos.length - 3} dividem ${pct(1 - parte)}.`,
      codccu: top3[0].l.codccu,
    });
  }

  // 3. melhor e pior margem (so' contratos com receita relevante: pelo menos 5% da receita da carteira)
  const relevantes = por.filter((x) => x.r.margem !== null && x.r.base >= carteira.base * 0.05);
  if (relevantes.length >= 3) {
    const ord = [...relevantes].sort((a, b) => b.r.margem! - a.r.margem!);
    const m = ord[0], p = ord[ord.length - 1];
    out.push({ id: "margens", tom: "info", titulo: `Margem vai de ${pct(p.r.margem!)} a ${pct(m.r.margem!)} entre os contratos de maior receita`, texto: `Melhor: ${m.l.nome} (${pct(m.r.margem!)}). Pior: ${p.l.nome} (${pct(p.r.margem!)}). Média da carteira: ${carteira.margem === null ? "–" : pct(carteira.margem)}.`, codccu: p.l.codccu });
  }

  // 4. custo sem receita no periodo
  const semReceita = por.filter((x) => x.r.base === 0 && x.r.custo + x.r.pessoal > 500).sort((a, b) => b.r.custo + b.r.pessoal - (a.r.custo + a.r.pessoal));
  if (semReceita.length) {
    out.push({
      id: "sem-receita", tom: "atencao",
      titulo: `${semReceita.length} ${semReceita.length === 1 ? "contrato tem custo e nenhuma receita" : "contratos têm custo e nenhuma receita"} no período`,
      texto: `${semReceita.slice(0, 3).map((x) => `${x.l.nome} (${brl(x.r.custo + x.r.pessoal)} de custo)`).join("; ")}. Pode ser contrato novo, encerrado ou medição ainda não lançada.`,
      codccu: semReceita[0].l.codccu,
    });
  }

  // 5. tendencia: ultimos 3 meses fechados x 3 anteriores (a carteira toda)
  const fechados = indices.filter((i) => meses[i] !== mesParcial);
  if (fechados.length >= 6) {
    const ult = fechados.slice(-3), ant = fechados.slice(-6, -3);
    const a = resumir(contratos, ant, o), u = resumir(contratos, ult, o);
    const delta = u.resultado - a.resultado;
    out.push({
      id: "tendencia", tom: delta >= 0 ? "bom" : "atencao",
      titulo: `Resultado dos últimos 3 meses ${delta >= 0 ? "subiu" : "caiu"} ${brl(Math.abs(delta))} sobre os 3 anteriores`,
      texto: `${brl(a.resultado)} (${mesTxt(meses[ant[0]])} a ${mesTxt(meses[ant[2]])}) → ${brl(u.resultado)} (${mesTxt(meses[ult[0]])} a ${mesTxt(meses[ult[2]])}). Margem: ${a.margem === null ? "–" : pct(a.margem)} → ${u.margem === null ? "–" : pct(u.margem)}.`,
    });
  }

  // 6. contratos que terminam em ate 90 dias (ficha do contrato)
  const vencendo = contratos
    .filter((l) => l.status === "ATIVO" && l.vigenciaFim && dias(hoje, l.vigenciaFim) >= 0 && dias(hoje, l.vigenciaFim) <= 90)
    .sort((a, b) => a.vigenciaFim!.localeCompare(b.vigenciaFim!));
  if (vencendo.length) {
    out.push({
      id: "vencendo", tom: "atencao", codccu: vencendo[0].codccu,
      titulo: `${vencendo.length} ${vencendo.length === 1 ? "contrato termina" : "contratos terminam"} em até 90 dias`,
      texto: vencendo.slice(0, 4).map((l) => `${l.nome} (${l.vigenciaFim!.split("-").reverse().join("/")}, ${dias(hoje, l.vigenciaFim!)} dias)`).join("; ") + ". Pela vigência cadastrada na ficha.",
    });
  }

  // 7. medido sem nota (receita que ainda nao virou nota)
  const semNota = soma(contratos.flatMap((l) => indices.map((i) => l.semNota?.[i] ?? 0)));
  if (semNota > 1000) out.push({ id: "sem-nota", tom: "info", titulo: `${brl(semNota)} da receita do período foram medidos e ainda estão sem nota`, texto: "Contam na receita (foram medidos), mas ainda não têm retenção: o resultado líquido deles pode cair quando a nota sair." });

  return out;
}

// ------------------------------------------------------------------------------------------------ centros que so' fazem sentido juntos

/** 210 e 230 (confirmado pelo Joao em 27/10/2026): o CUSTO do 3687 esta no 210 junto com o 3686 e a RECEITA do 3687 esta no 230 com o 3687 LT. Juntos, mostram o resultado real. */
export const CENTROS_JUNTOS = { codigo: "210+230", nome: "MRN 3686 + 3687 (CCU 210 + 230)", partes: ["210", "230"] as const };

/** Soma as series das `partes` numa linha so'; ficha e prazos vem da primeira parte presente. Sem as duas partes (ou so' uma), devolve as linhas como estao. */
export function juntarCentros(linhas: ReadonlyArray<LinhaDoResultado>, juntos = CENTROS_JUNTOS): LinhaDoResultado[] {
  const eParte = (l: LinhaDoResultado) => (juntos.partes as readonly string[]).includes(l.codccu);
  const partes = linhas.filter(eParte);
  if (partes.length < 2) return [...linhas];
  const s = somarSeries(partes, partes[0].receita.length);
  const merged: LinhaDoResultado = {
    ...partes[0], ...s, codccu: juntos.codigo, nome: juntos.nome,
    status: partes.every((p) => p.status === "ENCERRADO") ? "ENCERRADO" : "ATIVO",
    valorContrato: partes.some((p) => p.valorContrato !== null) ? soma(partes.map((p) => p.valorContrato ?? 0)) : null,
    vigenciaFim: partes.map((p) => p.vigenciaFim).filter((v): v is string => !!v).sort().pop() ?? null,
  };
  return [...linhas.filter((l) => !eParte(l)), merged];
}

export { zeros };
