// Vinculo UsuarioSenior (CODUSU) -> conta do sistema (User), 26/11/2026.
// O casamento e' SO' POR NOME. E-mail nao entra: caixas compartilhadas (fiscal@, viagens@) e e-mails repetidos entre pessoas
// ligavam o usuario da Senior a uma conta errada, e o titulo aparecia "lancado por" outra pessoa (ex.: Emily -> Pedro).

import { chaveNome, normalizarNome } from "@/lib/nomes";

const CONECTIVOS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

/** "mariana.silva" -> "Mariana Silva"; "geizi" -> "Geizi". */
export function nomeDeLogin(login: string): string {
  return normalizarNome(login.replace(/[._-]+/g, " "));
}

/** Nome da pessoa na Senior usado para casar: o nome se nao for so' o login "nome.sobrenome", senao o login em palavras. */
export function alvoNomeSenior(item: { nome: string; login?: string | null }): string {
  const login = (item.login || "").trim().toLowerCase();
  return item.nome && !item.nome.includes(".") ? item.nome : login ? nomeDeLogin(login) : item.nome;
}

/** Indice nome normalizado -> id da conta; nome repetido entre contas vira null (ambiguo, nao casa). */
export function indicePorNome(contas: { id: string; name: string }[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const c of contas) {
    const k = chaveNome(c.name);
    if (k) m.set(k, m.has(k) ? null : c.id);
  }
  return m;
}

/** Conta que casa por nome exato (normalizado), ou null. Nao olha e-mail. */
export function casarPorNome(item: { nome: string; login?: string | null }, porNome: Map<string, string | null>): string | null {
  return porNome.get(chaveNome(alvoNomeSenior(item))) ?? null;
}

const tokens = (nome: string) => chaveNome(nome).split(" ").filter((t) => t.length > 1 && !CONECTIVOS.has(t));

export type VinculoLinha = { codigo: string; nome: string; userId: string | null; user: { id: string; name: string; email: string } | null };
export type Suspeito = { codigo: string; nomeSenior: string; contaAtual: { id: string; name: string; email: string }; proposta: { id: string; name: string } | null };

/**
 * Vinculos existentes que nao batem com o nome da pessoa na Senior: algum nome do usuario da Senior ("emily", "sousa") nao
 * aparece no nome da conta ligada. Conservador de proposito: "geizi" ligado a "Geizi Silva" e' normal e NAO e' apontado.
 * A proposta e' a conta ativa de nome exato igual, ou null (so' desvincula).
 */
export function vinculosSuspeitos(linhas: VinculoLinha[], contasAtivas: { id: string; name: string }[]): Suspeito[] {
  const porNome = indicePorNome(contasAtivas);
  const nomePorId = new Map(contasAtivas.map((c) => [c.id, c.name]));
  const suspeitos: Suspeito[] = [];
  for (const l of linhas) {
    if (!l.user) continue;
    const deles = new Set(tokens(l.user.name));
    const doSenior = tokens(alvoNomeSenior({ nome: l.nome, login: l.nome }));
    if (!doSenior.length || doSenior.every((t) => deles.has(t))) continue;
    const id = casarPorNome({ nome: l.nome, login: l.nome }, porNome);
    suspeitos.push({ codigo: l.codigo, nomeSenior: l.nome, contaAtual: l.user, proposta: id && nomePorId.has(id) ? { id, name: nomePorId.get(id)! } : null });
  }
  return suspeitos;
}
