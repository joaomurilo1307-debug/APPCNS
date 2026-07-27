import { prisma } from "@/lib/prisma";

export async function getUserTeamIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

export async function isTeamManager(userId: string, teamId: string): Promise<boolean> {
  const membership = await prisma.userTeam.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  return membership?.role === "GESTOR";
}

/**
 * Admin sees everything. Everyone else only sees teams they belong to.
 */
export async function visibleTeamFilter(userId: string, systemRole: string) {
  if (systemRole === "ADMIN") return {};
  const teamIds = await getUserTeamIds(userId);
  return { teamId: { in: teamIds } };
}

export async function canManageTeam(userId: string, systemRole: string, teamId: string) {
  if (systemRole === "ADMIN") return true;
  return isTeamManager(userId, teamId);
}
