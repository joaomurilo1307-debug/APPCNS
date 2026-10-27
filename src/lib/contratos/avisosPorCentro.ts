// Aviso mostrado nas telas de centro de custo (CCU 210 e 230) porque o custo e a receita do 3687 ficam em centros de custo diferentes.
// Esclarecido pelo Joao em 27/10/2026 (diretoria): no CCU 210 o CUSTO do 3686 e' junto com o do 3687; no CCU 230 a RECEITA (faturamento/medicao)
// e' a do 3687 LT mais a do 3687. Quem analisa o 3687 precisa olhar 210 (custo) e 230 (receita) juntos. Texto so' com o que foi confirmado.

export type AvisoDoCentro = { titulo: string; linhas: string[] };

export const AVISOS_POR_CCU: Readonly<Record<string, AvisoDoCentro>> = {
  "210": {
    titulo: "os custos do 3686 são juntos com os do 3687",
    linhas: [
      "Custos: o 3686 e o 3687 estão juntos neste centro de custo (210).",
      "Receita: a receita do 3687 não está aqui, está no centro de custo 230, junto com o 3687 LT. Por isso a receita do 210 mostra só o faturamento do 3686.",
      "Para analisar receita e custo do 3687, olhe os centros de custo 210 e 230 juntos.",
    ],
  },
  "230": {
    titulo: "a receita é o 3687 LT mais o 3687",
    linhas: [
      "Receita: neste centro de custo (230) a receita (faturamento e medição) é a do 3687 LT mais a do 3687.",
      "Custos: aqui ficam os custos do 3687 LT. Os custos do 3687 não estão aqui, estão no centro de custo 210, junto com o 3686.",
      "Para analisar receita e custo do 3687, olhe os centros de custo 210 e 230 juntos.",
    ],
  },
};

// Versao de uma linha, para as telas que listam varios centros de custo (a lista completa do aviso fica na tela de um centro so').
export const RESUMO_DO_AVISO =
  "no CCU 210 os custos do 3686 são juntos com os do 3687; no CCU 230 a receita é o 3687 LT mais o 3687. Para analisar receita e custo do 3687, olhe os dois juntos.";

export const avisoDoCentro = (codccu: string | null | undefined): AvisoDoCentro | null => (codccu ? AVISOS_POR_CCU[codccu] ?? null : null);

export const temAviso = (codccus: readonly (string | null | undefined)[]): boolean => codccus.some((c) => avisoDoCentro(c) !== null);
