// Lista suspensa de pessoas: filtra pela busca (nome, cargo ou nucleo), tira quem ja foi escolhido e agrupa por nucleo. PURA, sem banco.
export type PessoaOpcao = { id: string; name: string; cargo?: string | null; nucleo?: string | null };
export type GrupoDePessoas = { nucleo: string | null; pessoas: PessoaOpcao[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function agruparPessoas(opcoes: PessoaOpcao[], escolhidos: string[], busca: string): GrupoDePessoas[] {
  const termo = semAcento(busca.trim());
  const ja = new Set(escolhidos);
  const mapa = new Map<string | null, PessoaOpcao[]>();
  for (const p of opcoes) {
    if (ja.has(p.id)) continue;
    if (termo && !semAcento(`${p.name} ${p.cargo ?? ""} ${p.nucleo ?? ""}`).includes(termo)) continue;
    const k = p.nucleo ?? null;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(p);
  }
  return Array.from(mapa.entries())
    .map(([nucleo, pessoas]) => ({ nucleo, pessoas: pessoas.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }))
    .sort((a, b) => (a.nucleo === null ? 1 : b.nucleo === null ? -1 : a.nucleo.localeCompare(b.nucleo, "pt-BR")));
}
