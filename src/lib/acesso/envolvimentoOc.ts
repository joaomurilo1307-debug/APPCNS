// Quem esta ENVOLVIDO numa OC do Senior (regra PURA, sem banco). Decisao do Joao (22/10/2026): quem nao e' do time financeiro ve nas
// Aprovacoes de OC so' as OCs em que esta envolvido, para nao enxergar aprovacoes de outros setores.
//
// Envolvido = pelo menos um destes, casado pelo CODUSU do Senior da pessoa (UsuarioSenior.codigo):
//   - emitiu a OC (criadorCod);
//   - falta aprovar (aprovadoresPendentesCod);
//   - ja assinou algum nivel (historicoNiveis[].USUAPR, ou rateioDetalhe[].niveis[].aprovadoPorCod);
//   - esta na alcada de algum nivel exigido (rateioDetalhe[].niveis[].aprovadoresCod).

export type OcParaEnvolvimento = {
  criadorCod?: string | null;
  aprovadoresPendentesCod?: string | null;
  historicoNiveis?: string | null;
  rateioDetalhe?: string | null;
};

function lerJson(texto: string | null | undefined): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function cod(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s && s !== "0" ? s : null;
}

/** Todos os codigos do Senior ligados a esta OC, por qualquer um dos motivos acima. */
export function codigosDaOC(oc: OcParaEnvolvimento): Set<string> {
  const saida = new Set<string>();
  const juntar = (v: unknown) => {
    const c = cod(v);
    if (c) saida.add(c);
  };
  juntar(oc.criadorCod);
  for (const c of (oc.aprovadoresPendentesCod ?? "").split(",")) juntar(c);
  const hist = lerJson(oc.historicoNiveis);
  if (Array.isArray(hist)) for (const h of hist) juntar((h as any)?.USUAPR);
  const rateio = lerJson(oc.rateioDetalhe);
  if (Array.isArray(rateio)) {
    for (const linha of rateio) {
      const niveis = (linha as any)?.niveis;
      if (!Array.isArray(niveis)) continue;
      for (const n of niveis) {
        juntar(n?.aprovadoPorCod);
        if (Array.isArray(n?.aprovadoresCod)) for (const a of n.aprovadoresCod) juntar(a);
      }
    }
  }
  return saida;
}

export function envolvidoNaOC(oc: OcParaEnvolvimento, meusCodigos: ReadonlySet<string>): boolean {
  if (meusCodigos.size === 0) return false;
  for (const c of codigosDaOC(oc)) if (meusCodigos.has(c)) return true;
  return false;
}

/**
 * Filtro GROSSEIRO para o banco (texto contem o codigo): so' reduz as linhas a olhar. Quem decide e' `envolvidoNaOC` (codigo exato),
 * porque "17" tambem esta contido em "177".
 */
export function filtroGrosseiroDeEnvolvimento(meusCodigos: ReadonlyArray<string>) {
  const cods = meusCodigos.map((c) => c.trim()).filter(Boolean);
  if (cods.length === 0) return null;
  return {
    OR: [
      { criadorCod: { in: cods } },
      ...cods.flatMap((c) => [
        { aprovadoresPendentesCod: { contains: c } },
        // com e sem espaco depois dos dois pontos, codigo como texto ou como numero (o Python grava ": ", o JS grava ":")
        ...[": ", ":"].flatMap((sep) => [`"USUAPR"${sep}"${c}"`, `"USUAPR"${sep}${c},`, `"USUAPR"${sep}${c}}`].map((trecho) => ({ historicoNiveis: { contains: trecho } }))),
        { rateioDetalhe: { contains: `"${c}"` } },
      ]),
    ],
  };
}
