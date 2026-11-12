// Quem ainda trabalha aqui, para a busca de OCs tirar aprovador desligado da alcada (12/11/2026). A alcada do Senior
// (E068CNA.SITCNA='A') e o login (SITUSU) continuam ativos meses depois do desligamento (11/09/2026: tres casos); a fonte real
// e' a folha: R034FUN.SITAFA=1, lida na porta GetDBInfo do HCM (Rubi), que tem credencial PROPRIA (diferente da do ERP):
// SENIOR_WS_HCM_USER / SENIOR_WS_HCM_PASSWORD (opcional SENIOR_WS_HCM_URL).
//
// Ordem, do melhor para o pior:
//  1. folha lida agora (e guardada em RosterAtivoSenior);
//  2. ultima folha guardada (a leitura falhou ou a credencial nao esta configurada);
//  3. desligados que a sincronizacao anterior (script do VPS) ja deixou marcados nas OCs gravadas;
//  4. sem filtro: ninguem e' marcado como desligado (nunca trava a busca por causa disso).

import { prisma } from "@/lib/prisma";
import { consultarSeniorForaDaFila, type DestinoSenior } from "../getDbInfo";

const URL_HCM = "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/rubi_Synccom_senior_g5_rh_fp_db";

export type FonteDasPessoas = "FOLHA" | "FOLHA_GUARDADA" | "DESLIGADOS_JA_MARCADOS" | "SEM_FILTRO";
export type SituacaoDasPessoas = { ativo: (login: string) => boolean; fonte: FonteDasPessoas; detalhe: string };

/** Maiusculas, sem acento, ponto e hifen viram espaco (mesma normalizacao do script). */
export function normalizarPessoa(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.\-]/g, " ");
}

/** Login "nome.sobrenome" bate com alguem da folha quando TODOS os pedacos (com mais de 2 letras) estao no nome completo. */
export function ativoPelaFolha(nomesNaFolha: string[]): (login: string) => boolean {
  const cache = new Map<string, boolean>();
  return (login) => {
    if (cache.has(login)) return cache.get(login)!;
    const pedacos = normalizarPessoa(login).split(/\s+/).filter((t) => t.length > 2);
    const ok = pedacos.length > 0 && nomesNaFolha.some((nome) => pedacos.every((t) => nome.includes(t)));
    cache.set(login, ok);
    return ok;
  };
}

export function destinoHcm(): DestinoSenior | null {
  const usuario = process.env.SENIOR_WS_HCM_USER;
  const senha = process.env.SENIOR_WS_HCM_PASSWORD;
  if (!usuario || !senha) return null;
  return { url: process.env.SENIOR_WS_HCM_URL?.trim() || URL_HCM, usuario, senha };
}

async function lerFolhaPadrao(): Promise<string[] | null> {
  const destino = destinoHcm();
  if (!destino) return null;
  // Fora da fila das telas, como o resto da busca: a porta da folha pode demorar (150 s de limite).
  const linhas = await consultarSeniorForaDaFila("SELECT NOMFUN FROM R034FUN WHERE SITAFA=1", { timeoutMs: 150_000, destino });
  return linhas.map((l) => l.NOMFUN).filter(Boolean);
}

/** Logins que a sincronizacao anterior ja marcou "(desligado)" nas OCs gravadas (aprovadores pendentes e niveis do rateio). */
export async function desligadosJaMarcados(): Promise<Set<string>> {
  const linhas = await prisma.aprovacaoSenior.findMany({
    where: { OR: [{ aprovadoresPendentes: { contains: "(desligado)" } }, { rateioDetalhe: { contains: "(desligado)" } }] },
    select: { aprovadoresPendentes: true, rateioDetalhe: true },
  });
  const logins = new Set<string>();
  const marcar = (s: unknown) => {
    const m = /^(.*) \(desligado\)$/.exec(String(s ?? "").trim());
    if (m && m[1]) logins.add(m[1]);
  };
  for (const l of linhas) {
    for (const nome of (l.aprovadoresPendentes ?? "").split(", ")) marcar(nome);
    try {
      for (const linha of JSON.parse(l.rateioDetalhe ?? "[]")) for (const nivel of linha?.niveis ?? []) for (const a of nivel?.aprovadores ?? []) marcar(a);
    } catch {
      // rateio gravado fora do formato: ignora esta OC
    }
  }
  return logins;
}

export async function situacaoDasPessoas(
  opcoes: { lerFolha?: () => Promise<string[] | null>; pausaMs?: number } = {}
): Promise<SituacaoDasPessoas> {
  const lerFolha = opcoes.lerFolha ?? lerFolhaPadrao;
  let motivo = "credencial da folha (HCM) não configurada";
  for (const tentativa of [1, 2]) {
    try {
      const nomes = await lerFolha();
      if (!nomes) break;
      if (!nomes.length) throw new Error("a folha veio vazia");
      const normalizados = nomes.map(normalizarPessoa);
      await prisma.rosterAtivoSenior.upsert({
        where: { id: "atual" },
        create: { id: "atual", nomes: JSON.stringify(normalizados), capturadoEm: new Date() },
        update: { nomes: JSON.stringify(normalizados), capturadoEm: new Date() },
      });
      return { ativo: ativoPelaFolha(normalizados), fonte: "FOLHA", detalhe: `${normalizados.length} pessoas ativas na folha` };
    } catch (e) {
      motivo = `leitura da folha falhou (${String((e as Error)?.message ?? e).slice(0, 120)})`;
      if (tentativa === 1) await new Promise((r) => setTimeout(r, opcoes.pausaMs ?? 20_000));
    }
  }

  const guardada = await prisma.rosterAtivoSenior.findUnique({ where: { id: "atual" } });
  if (guardada) {
    const nomes = JSON.parse(guardada.nomes) as string[];
    return {
      ativo: ativoPelaFolha(nomes),
      fonte: "FOLHA_GUARDADA",
      detalhe: `${motivo}; usada a folha guardada em ${guardada.capturadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    };
  }
  const desligados = await desligadosJaMarcados();
  if (desligados.size) {
    return {
      ativo: (login) => !desligados.has(login),
      fonte: "DESLIGADOS_JA_MARCADOS",
      detalhe: `${motivo}; mantidos os ${desligados.size} desligados já marcados (desligamentos novos não são detectados)`,
    };
  }
  return { ativo: () => true, fonte: "SEM_FILTRO", detalhe: `${motivo}; ninguém marcado como desligado` };
}
