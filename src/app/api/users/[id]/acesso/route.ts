import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { GRUPOS, MODULOS, PAPEIS_DO_SISTEMA, PERFIS_PRONTOS, acessosEfetivos, lerNiveis, lerSobreposicoes, sobreposicoesParaGravar, type NivelAcesso } from "@/lib/acesso/catalogo";
import { limparCacheDeAcesso } from "@/lib/acesso/servidor";
import { limparCacheDeOcs } from "@/lib/acesso/aprovacoesOc";

// Tela Usuarios > Acesso (so' ADMIN): tudo o que uma pessoa pode ver e fazer, num lugar so' -- papel, telas (ver ou editar), visao dos projetos,
// projetos liberados, contratos (nos projetos e no financeiro), nucleos e vinculo com o usuario do Senior.

async function exigirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const user = session.user as any;
  if (user.role !== "ADMIN") return { erro: NextResponse.json({ error: "Só administradores gerenciam acessos" }, { status: 403 }) };
  return { user };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { erro } = await exigirAdmin();
  if (erro) return erro;

  const alvo = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, role: true, active: true, verTodosCustos: true, escopoProjetos: true, nucleoId: true,
      acessosModulo: { select: { modulo: true, permitido: true, nivel: true } },
      acessosProjeto: { select: { projectId: true } },
      acessosCentroCusto: { select: { codccu: true, area: true } },
      vinculosSenior: { select: { codigo: true } },
      nucleosGerenciados: { select: { id: true } },
      nucleosCoordenados: { select: { id: true } },
      nucleosDirigidos: { select: { id: true } },
    },
  });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const [projetos, centros, nucleos, usuariosSenior, vinculosDeTodos] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true, status: true, team: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.custoContaFinanceira.groupBy({ by: ["codccu", "contrato"], _sum: { valor: true } }),
    prisma.nucleo.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true, userId: true } }),
    prisma.vinculoSenior.findMany({ select: { codigo: true, user: { select: { id: true, name: true } } } }),
  ]);

  const nomesCentro = new Map<string, string>();
  for (const c of centros) if (!nomesCentro.has(c.codccu)) nomesCentro.set(c.codccu, c.contrato.replace(new RegExp(`^${c.codccu}\\s*-\\s*`), "").trim() || c.contrato);

  const porCodigo = new Map(usuariosSenior.map((u) => [u.codigo, u]));
  const outrosPorCodigo = new Map<string, string[]>();
  for (const v of vinculosDeTodos) if (v.user.id !== alvo.id) outrosPorCodigo.set(v.codigo, [...(outrosPorCodigo.get(v.codigo) ?? []), v.user.name]);

  const sobre = lerSobreposicoes(alvo.acessosModulo);
  const niveis = lerNiveis(alvo.acessosModulo);

  return NextResponse.json({
    usuario: { id: alvo.id, name: alvo.name, email: alvo.email, role: alvo.role, active: alvo.active, escopoProjetos: alvo.escopoProjetos, verTodosCustos: alvo.verTodosCustos, nucleoId: alvo.nucleoId },
    papeis: PAPEIS_DO_SISTEMA,
    grupos: GRUPOS,
    modulos: MODULOS.map((m) => ({ id: m.id, label: m.label, grupo: m.grupo, restrito: m.restrito, descricao: m.descricao })),
    perfis: PERFIS_PRONTOS,
    acessos: acessosEfetivos(alvo.role, sobre, niveis),
    projetos: {
      disponiveis: projetos.map((p) => ({ id: p.id, name: p.name, status: p.status, equipe: p.team?.name ?? null })),
      liberados: alvo.acessosProjeto.map((a) => a.projectId),
    },
    contratos: {
      disponiveis: Array.from(nomesCentro.entries()).map(([codccu, nome]) => ({ codccu, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      liberados: alvo.acessosCentroCusto.map((a) => ({ codccu: a.codccu, area: a.area })),
      verTodos: alvo.verTodosCustos,
      verTodosPeloPapel: alvo.role === "ADMIN" || alvo.role === "DIRETOR",
    },
    nucleos: {
      todos: nucleos,
      membroDe: alvo.nucleoId,
      gerente: alvo.nucleosGerenciados.map((n) => n.id),
      coordenador: alvo.nucleosCoordenados.map((n) => n.id),
      diretor: alvo.nucleosDirigidos.map((n) => n.id),
    },
    senior: {
      // so' o vinculo MANUAL conta; o de-para automatico aparece como sugestao para o admin confirmar
      vinculos: alvo.vinculosSenior.map((v) => ({ codigo: v.codigo, nome: porCodigo.get(v.codigo)?.nome ?? `#${v.codigo}`, tambemUsam: outrosPorCodigo.get(v.codigo) ?? [] })),
      sugestoes: usuariosSenior
        .filter((u) => u.userId === alvo.id && !alvo.vinculosSenior.some((v) => v.codigo === u.codigo))
        .map((u) => ({ codigo: u.codigo, nome: u.nome })),
    },
  });
}

const nivelSchema = z.enum(["VER", "EDITAR"]);
const putSchema = z.object({
  role: z.enum(PAPEIS_DO_SISTEMA).optional(),
  acessos: z.array(z.object({ modulo: z.string(), nivel: nivelSchema })).max(100),
  escopoProjetos: z.enum(["PROPRIOS", "NUCLEO", "TODOS"]),
  projetos: z.array(z.string()).max(2000),
  contratos: z.object({
    verTodos: z.boolean(),
    itens: z.array(z.object({ codccu: z.string().regex(/^\d+$/), area: z.enum(["PROJETOS", "FINANCEIRO", "AMBOS"]) })).max(500),
  }),
  nucleos: z.object({ membroDe: z.string().nullable(), gerente: z.array(z.string()).max(100), coordenador: z.array(z.string()).max(100), diretor: z.array(z.string()).max(100).optional() }),
  senior: z.array(z.string().regex(/^\d+$/)).max(20),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { erro, user } = await exigirAdmin();
  if (erro) return erro;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const alvo = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true, role: true } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (d.role && d.role !== alvo.role && alvo.id === user.id) return NextResponse.json({ error: "Você não pode mudar o seu próprio papel" }, { status: 422 });
  const papel = d.role ?? alvo.role;

  const idsValidos = new Set(MODULOS.map((m) => m.id as string));
  const desejados = d.acessos.filter((a) => idsValidos.has(a.modulo));
  const niveis: Record<string, NivelAcesso> = Object.fromEntries(desejados.map((a) => [a.modulo, a.nivel]));
  const linhas = sobreposicoesParaGravar(papel, desejados.map((a) => a.modulo), niveis);

  const codigosSenior = Array.from(new Set(d.senior));
  if (codigosSenior.length) {
    const existentes = await prisma.usuarioSenior.findMany({ where: { codigo: { in: codigosSenior } }, select: { codigo: true } });
    const faltam = codigosSenior.filter((c) => !existentes.some((e) => e.codigo === c));
    if (faltam.length) return NextResponse.json({ error: `Código(s) do Senior desconhecido(s): ${faltam.join(", ")}` }, { status: 422 });
  }
  const quem = user.name ?? user.email ?? "admin";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: alvo.id },
      data: { ...(d.role ? { role: d.role } : {}), escopoProjetos: d.escopoProjetos, verTodosCustos: d.contratos.verTodos, nucleoId: d.nucleos.membroDe },
    });

    await tx.acessoModulo.deleteMany({ where: { userId: alvo.id } });
    if (linhas.length) await tx.acessoModulo.createMany({ data: linhas.map((l) => ({ userId: alvo.id, modulo: l.modulo, permitido: l.permitido, nivel: l.nivel ?? "EDITAR", concedidoPor: quem })) });

    await tx.acessoProjeto.deleteMany({ where: { userId: alvo.id } });
    const projetosOk = await tx.project.findMany({ where: { id: { in: d.projetos } }, select: { id: true } });
    if (projetosOk.length) await tx.acessoProjeto.createMany({ data: projetosOk.map((p) => ({ userId: alvo.id, projectId: p.id, concedidoPor: quem })), skipDuplicates: true });

    await tx.acessoCentroCusto.deleteMany({ where: { userId: alvo.id } });
    const unicos = new Map(d.contratos.itens.map((i) => [i.codccu, i.area]));
    if (unicos.size) await tx.acessoCentroCusto.createMany({ data: Array.from(unicos.entries()).map(([codccu, area]) => ({ userId: alvo.id, codccu, area, concedidoPor: quem })), skipDuplicates: true });

    await tx.vinculoSenior.deleteMany({ where: { userId: alvo.id } });
    if (codigosSenior.length) await tx.vinculoSenior.createMany({ data: codigosSenior.map((codigo) => ({ userId: alvo.id, codigo, criadoPor: quem })), skipDuplicates: true });

    // gerente / coordenador / diretor: ajusta so' o que mudou em cada nucleo (diretor so' muda se a tela mandou a lista)
    const todos = await tx.nucleo.findMany({ select: { id: true, gerentes: { select: { id: true } }, coordenadores: { select: { id: true } }, diretores: { select: { id: true } } } });
    for (const n of todos) {
      const eraGerente = n.gerentes.some((g) => g.id === alvo.id);
      const eraCoord = n.coordenadores.some((g) => g.id === alvo.id);
      const eraDiretor = n.diretores.some((g) => g.id === alvo.id);
      const querGerente = d.nucleos.gerente.includes(n.id);
      const querCoord = d.nucleos.coordenador.includes(n.id);
      const querDiretor = d.nucleos.diretor === undefined ? eraDiretor : d.nucleos.diretor.includes(n.id);
      if (eraGerente === querGerente && eraCoord === querCoord && eraDiretor === querDiretor) continue;
      await tx.nucleo.update({
        where: { id: n.id },
        data: {
          ...(eraGerente !== querGerente ? { gerentes: querGerente ? { connect: { id: alvo.id } } : { disconnect: { id: alvo.id } } } : {}),
          ...(eraCoord !== querCoord ? { coordenadores: querCoord ? { connect: { id: alvo.id } } : { disconnect: { id: alvo.id } } } : {}),
          ...(eraDiretor !== querDiretor ? { diretores: querDiretor ? { connect: { id: alvo.id } } : { disconnect: { id: alvo.id } } } : {}),
        },
      });
    }
  });

  limparCacheDeAcesso(alvo.id);
  limparCacheDeOcs(alvo.id);
  await logAudit({
    userId: user.id, action: "usuario.acesso", entityType: "User", entityId: alvo.id,
    metadata: { alvo: alvo.name, papel, modulos: desejados.map((a) => `${a.modulo}:${a.nivel}`), escopoProjetos: d.escopoProjetos, projetos: d.projetos.length, contratos: d.contratos.itens.length, verTodosContratos: d.contratos.verTodos, senior: codigosSenior },
  });
  return NextResponse.json({ ok: true });
}
