// Seleção de títulos da Programação de Pagamento, guardada no navegador
// (06/10/2026, pedido do João: "não fica salvo na página de programação de
// pagamento os títulos que selecionamos"). Antes a seleção morava só num
// useState: sair da tela -- por exemplo pra gerar a remessa e voltar --
// apagava tudo. Só localStorage, por navegador, igual ao rascunho do carrinho
// de Pagamentos Itaú; o dado real continua no servidor.
//
// Usado pela Programação de Pagamento (lê/salva) e por Pagamentos Itaú (tira
// da seleção os títulos que viraram remessa, pra não ficarem selecionados pra
// sempre).

const CHAVE = "programacaoPagamento:selecionados:v2";

/** Dia de hoje no relógio do navegador (yyyy-mm-dd). A seleção e o carrinho só valem no dia em que foram feitos. */
export const diaDeHoje = () => new Date().toLocaleDateString("sv-SE");

// Guarda { dia, ids }. Seleção de ontem não volta hoje (19/10/2026, pedido da Renata): vira lista vazia.
export function lerSelecaoSalva(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const salvo = bruto ? JSON.parse(bruto) : null;
    if (!salvo || salvo.dia !== diaDeHoje() || !Array.isArray(salvo.ids)) return [];
    return salvo.ids.filter((id: unknown): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function salvarSelecao(ids: Iterable<string>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ dia: diaDeHoje(), ids: [...ids] }));
  } catch {
    // Modo privado/quota cheia -- perde só a conveniência de lembrar.
  }
}

export function removerDaSelecaoSalva(ids: (string | null | undefined)[]) {
  const sair = new Set(ids.filter((id): id is string => !!id));
  if (sair.size === 0) return;
  salvarSelecao(lerSelecaoSalva().filter((id) => !sair.has(id)));
}
