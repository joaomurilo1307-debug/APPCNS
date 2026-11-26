// De-para dos usuarios do Senior (E099USU) -> UsuarioSenior (codigo -> nome/conta). Antes so' na rota
// /api/senior/usuarios/sync (recebia do script do VPS ou da tela /usuarios/senior); agora tambem roda na busca de OCs
// feita pelo proprio sistema (12/11/2026). Casa com a conta do sistema SO' por nome normalizado == User.name (e-mail nao conta,
// desde 26/11/2026). Nunca troca um vinculo ja existente; os errados sao corrigidos em /usuarios/senior (vinculos suspeitos).

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizarNome } from "@/lib/nomes";
import { casarPorNome, indicePorNome, nomeDeLogin } from "../vinculosUsuario";

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

export async function processarUsuarios(lista: UsuarioSync[]) {
  // 26/11/2026: casa SO' POR NOME (lib/senior/vinculosUsuario.ts). E-mail nao entra mais: caixas compartilhadas ligavam o usuario
  // da Senior a uma conta errada.
  const usuarios = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const porNome = indicePorNome(usuarios);
  const casar = (item: { nome: string; login?: string | null }) => casarPorNome(item, porNome);

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
    // e-mail do usuario no Senior: so' guardado (o acesso a OCs por e-mail igual, src/lib/acesso/vinculoSenior.ts, e' outra regra)
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
