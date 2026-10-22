// Acesso a modulos NO SERVIDOR: le as liberacoes gravadas (AcessoModulo) e aplica a regra do catalogo. Usado por todas as rotas
// do financeiro e pelo menu. Guarda a leitura por 20 s na memoria para nao consultar o banco a cada chamada da tela.

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POR_ID, lerSobreposicoes, moduloPermitido, modulosEfetivos, type ModuloId, type Sobreposicoes } from "./catalogo";

const VALIDADE_MS = 20_000;
const guardado = new Map<string, { ate: number; mapa: Sobreposicoes }>();

export type UsuarioDaSessao = { id: string; role: string };

export function limparCacheDeAcesso(userId?: string) {
  if (userId) guardado.delete(userId);
  else guardado.clear();
}

export async function sobreposicoesDe(userId: string): Promise<Sobreposicoes> {
  const agora = Date.now();
  const g = guardado.get(userId);
  if (g && g.ate > agora) return g.mapa;
  const linhas = await prisma.acessoModulo.findMany({ where: { userId }, select: { modulo: true, permitido: true } });
  const mapa = lerSobreposicoes(linhas);
  guardado.set(userId, { ate: agora + VALIDADE_MS, mapa });
  return mapa;
}

/** A pessoa entra neste modulo? */
export async function podeAcessarModulo(usuario: UsuarioDaSessao, modulo: ModuloId): Promise<boolean> {
  const def = POR_ID.get(modulo);
  if (!def) return false;
  if (usuario.role === "ADMIN") return true;
  return moduloPermitido(def, usuario.role, await sobreposicoesDe(usuario.id));
}

/** Ids dos modulos que a pessoa enxerga (menu e tela de acesso). */
export async function modulosDoUsuario(usuario: UsuarioDaSessao): Promise<ModuloId[]> {
  return modulosEfetivos(usuario.role, await sobreposicoesDe(usuario.id));
}

/**
 * Para as rotas: devolve a resposta 403 quando a pessoa NAO entra em nenhum dos modulos informados, ou null quando pode seguir.
 *   const negado = await negarSemModulo(session.user as any, "conferencia_oc"); if (negado) return negado;
 */
export async function negarSemModulo(usuario: UsuarioDaSessao | null | undefined, ...modulos: ModuloId[]): Promise<NextResponse | null> {
  if (!usuario) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  for (const m of modulos) if (await podeAcessarModulo(usuario, m)) return null;
  return NextResponse.json({ error: "Sem permissão para este módulo" }, { status: 403 });
}

/**
 * Para as PAGINAS (server components / layout.tsx): quem nao entra em nenhum dos modulos volta para o inicio.
 * Cobre quem digita o endereco direto, que o menu escondido nao impede.
 */
export async function exigirModulo(...modulos: ModuloId[]): Promise<void> {
  const session = await getServerSession(authOptions);
  const usuario = session?.user as any;
  if (!usuario?.id) redirect("/login");
  for (const m of modulos) if (await podeAcessarModulo(usuario, m)) return;
  redirect("/inicio");
}
