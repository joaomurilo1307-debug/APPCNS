import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chaveNome, normalizarNome } from "@/lib/nomes";

// De-para dos usuarios do Senior. Recebe [{codigo, nome, email?, login?}]
// -- do E099USU (via script Python) ou colado na tela /usuarios/senior --
// e faz upsert em UsuarioSenior, casando com a conta do consominas-gestao
// nesta ordem: (1) email do Senior == User.email; (2) login.sobrenome
// @consominas.com.br == User.email (formato dos e-mails do roster);
// (3) nome normalizado == User.name. Protegido pela SENIOR_SYNC_KEY.
//
// Depois disso o proximo sync de aprovacoes resolve proximoAprovadorNome/
// UserId sozinho (logica em .../aprovacoes/sync).

const DOMINIO = "@consominas.com.br";

const schema = z.object({
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

function nomeDeLogin(login: string): string {
  // "mariana.silva" -> "Mariana Silva"; "geizi" -> "Geizi"
  return normalizarNome(login.replace(/[._-]+/g, " "));
}

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

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
  for (const item of parsed.data.usuarios) {
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
    // nome de exibicao: o que veio, mas se for so o login "nome.sobrenome"
    // deixa mais apresentavel
    const nomeExib = item.nome.includes(".") && !item.nome.includes(" ") ? nomeDeLogin(item.nome) : item.nome;
    await prisma.usuarioSenior.upsert({
      where: { codigo: item.codigo },
      update: { nome: nomeExib, userId },
      create: { codigo: item.codigo, nome: nomeExib, userId },
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

  return NextResponse.json({ ok: true, recebidos: parsed.data.usuarios.length, upserts, casadosAutomaticamente: casados });
}
