// De-para dos usuarios do Senior (E099USU) -> UsuarioSenior (codigo -> nome/conta). Antes so' na rota
// /api/senior/usuarios/sync (recebia do script do VPS ou da tela /usuarios/senior); agora tambem roda na busca de OCs
// feita pelo proprio sistema (12/11/2026). Casa com a conta do sistema nesta ordem: (1) e-mail do Senior == User.email;
// (2) login@consominas.com.br == User.email; (3) nome normalizado == User.name. Nunca troca um vinculo ajustado na tela.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chaveNome, normalizarNome } from "@/lib/nomes";

const DOMINIO = "@consominas.com.br";

export const usuariosSchema = z.object({
  usuarios: z
    .array(
      z.object({
        codigo: z.string().min(1),
        nome: z.string().min(1),
        email: z.string().optional().nullable(),
        login: z.string().optional().nullable(),
      })
    )
    .max(5000),
});

export type UsuarioSync = z.infer<typeof usuariosSchema>["usuarios"][number];

function nomeDeLogin(login: string): string {
  // "mariana.silva" -> "Mariana Silva"; "geizi" -> "Geizi"
  return normalizarNome(login.replace(/[._-]+/g, " "));
}

export async function processarUsuarios(lista: UsuarioSync[]) {
  const usuarios = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } });
  const porEmail = new Map<string, string>();
  const porNome = new Map<string, string | null>();
  for (const u of usuarios) {
    if (u.email) porEmail.set(u.email.toLowerCase(), u.id);
    const k = chaveNome(u.name);
    if (k) porNome.set(k, porNome.has(k) ? null : u.id);
  }

  function casar(item: { nome: string; email?: string | null; login?: string | null }): string | null {
    const e = (item.email || "").trim().toLowerCase();
    if (e && porEmail.has(e)) return porEmail.get(e)!;
    const login = (item.login || "").trim().toLowerCase();
    if (login) {
      const emailLogin = login.includes("@") ? login : `${login}${DOMINIO}`;
      if (porEmail.has(emailLogin)) return porEmail.get(emailLogin)!;
    }
    const alvoNome = item.nome && !item.nome.includes(".") ? item.nome : login ? nomeDeLogin(login) : item.nome;
    const m = porNome.get(chaveNome(alvoNome));
    return m ?? null;
  }

  let upserts = 0;
  let casados = 0;
  for (const item of lista) {
    const existente = await prisma.usuarioSenior.findUnique({ where: { codigo: item.codigo } });
    // nao sobrescreve um vinculo ajustado manualmente na tela
    let userId = existente?.userId ?? null;
    if (!userId) {
      const m = casar(item);
      if (m) {
        userId = m;
        casados++;
      }
    }
    // nome de exibicao: o que veio, mas se for so o login "nome.sobrenome" deixa mais apresentavel
    const nomeExib = item.nome.includes(".") && !item.nome.includes(" ") ? nomeDeLogin(item.nome) : item.nome;
    // e-mail do usuario no Senior: base do vinculo automatico por e-mail igual (src/lib/acesso/vinculoSenior.ts)
    const emailSenior = (item.email || "").trim().toLowerCase() || null;
    await prisma.usuarioSenior.upsert({
      where: { codigo: item.codigo },
      update: { nome: nomeExib, userId, email: emailSenior },
      create: { codigo: item.codigo, nome: nomeExib, userId, email: emailSenior },
    });
    upserts++;
  }

  // propaga os vinculos recem-descobertos pras OCs pendentes
  const comConta = await prisma.usuarioSenior.findMany({ where: { userId: { not: null } }, include: { user: { select: { name: true } } } });
  for (const u of comConta) {
    await prisma.aprovacaoSenior.updateMany({
      where: { proximoAprovadorCod: u.codigo, situacaoAtual: { in: ["ANA", "PRE"] } },
      data: { proximoAprovadorUserId: u.userId, proximoAprovadorNome: u.user?.name ?? u.nome },
    });
  }

  return { recebidos: lista.length, upserts, casadosAutomaticamente: casados };
}
