// Quem pode ver e quem pode editar o Controle de Custos de um centro de custo (CCU). Mesma regra de visibilidade que ja vale em
// /api/custos-conta: ADMIN/DIRETOR e quem tem `verTodosCustos` veem tudo; os demais veem os CCUs das equipes de que participam
// (Team.codccu). EDITAR o previsto e' mais restrito: ADMIN/DIRETOR ou quem participa da equipe daquele CCU -- `verTodosCustos` sozinho
// da' so' leitura.

import { prisma } from "@/lib/prisma";

export type Acesso = { userId: string; role: string; vePodeTudo: boolean; edita: "tudo" | "equipes" };

export async function acessoCustos(user: { id: string; role: string }): Promise<Acesso> {
  const adminOuDiretor = ["ADMIN", "DIRETOR"].includes(user.role);
  let vePodeTudo = adminOuDiretor;
  if (!vePodeTudo) {
    const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { verTodosCustos: true } });
    vePodeTudo = !!eu?.verTodosCustos;
  }
  return { userId: user.id, role: user.role, vePodeTudo, edita: adminOuDiretor ? "tudo" : "equipes" };
}

async function souMembroDoCentro(userId: string, codccu: string): Promise<boolean> {
  const time = await prisma.team.findFirst({ where: { codccu }, select: { id: true } });
  if (!time) return false;
  const vinculo = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId, teamId: time.id } } });
  return !!vinculo;
}

export async function podeVerCentro(a: Acesso, codccu: string): Promise<boolean> {
  if (a.vePodeTudo) return true;
  return souMembroDoCentro(a.userId, codccu);
}

export async function podeEditarCentro(a: Acesso, codccu: string): Promise<boolean> {
  if (a.edita === "tudo") return true;
  return souMembroDoCentro(a.userId, codccu);
}

/** Valida um codigo de CCU (so' digitos) antes de usar em consulta. */
export const ccuValido = (c: unknown): c is string => typeof c === "string" && /^\d{1,10}$/.test(c);
