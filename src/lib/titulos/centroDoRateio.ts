// Centro(s) de custo do RATEIO de um titulo (PURO): as linhas de custo do titulo (mesmo numero e fornecedor) e, quando a linha traz o tipo do titulo (NFS, OUT...), so' as do mesmo tipo
// (o mesmo numero e fornecedor pode existir em tipos diferentes). Devolve os centros distintos, em ordem; vazio = o sistema nao tem rateio desse titulo (ex.: conta fora do custo).

export type LinhaDeRateio = { codTpt: string | null; codccu: string };

export function centroDoRateio(linhas: ReadonlyArray<LinhaDeRateio>, tipoDoTitulo: string | null | undefined): string[] {
  const tipo = (tipoDoTitulo ?? "").trim();
  const doTipo = linhas.filter((l) => !l.codTpt || !tipo || l.codTpt.trim() === tipo);
  return Array.from(new Set(doTipo.map((l) => l.codccu.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}
