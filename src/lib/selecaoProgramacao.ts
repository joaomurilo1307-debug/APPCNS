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

const CHAVE = "programacaoPagamento:selecionados:v1";

export function lerSelecaoSalva(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function salvarSelecao(ids: Iterable<string>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...ids]));
  } catch {
    // Modo privado/quota cheia -- perde só a conveniência de lembrar.
  }
}

export function removerDaSelecaoSalva(ids: (string | null | undefined)[]) {
  const sair = new Set(ids.filter((id): id is string => !!id));
  if (sair.size === 0) return;
  salvarSelecao(lerSelecaoSalva().filter((id) => !sair.has(id)));
}
