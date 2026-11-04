// Vigia das cargas do Senior. Os dados de titulos a pagar e de OCs chegam por scripts externos (VPS + n8n) que enviam para este sistema.
// Se algo muda no caminho (dominio trocado, VPS parada, chave errada), o n8n continua mostrando "sucesso" e as telas ficam com numeros velhos
// sem ninguem perceber (29/10/2026: 140 min parado depois da troca de dominio). O vigia olha a propria base: a carga mais recente de cada fonte
// e, se passou do limite dentro do horario de trabalho, avisa os administradores no sino -- uma vez a cada 3 h por fonte.

export const LIMITE_ATRASO_MIN = 45; // as cargas rodam a cada 10 min; 45 min = 4 ciclos perdidos
export const INTERVALO_ENTRE_AVISOS_MS = 3 * 60 * 60_000;

export type FonteCarga = { chave: "titulos" | "ocs"; nome: string; ultimaEm: Date | null };
export type Atraso = { chave: FonteCarga["chave"]; nome: string; minutos: number | null };

/** PURA: quais fontes estao atrasadas. Fora do horario de trabalho (janelaAberta=false) nada e' atraso. ultimaEm=null = nunca chegou carga. */
export function fontesAtrasadas(agora: Date, fontes: FonteCarga[], janelaAberta: boolean, limiteMin = LIMITE_ATRASO_MIN): Atraso[] {
  if (!janelaAberta) return [];
  const atrasos: Atraso[] = [];
  for (const f of fontes) {
    if (!f.ultimaEm) {
      atrasos.push({ chave: f.chave, nome: f.nome, minutos: null });
      continue;
    }
    const minutos = Math.floor((agora.getTime() - f.ultimaEm.getTime()) / 60_000);
    if (minutos > limiteMin) atrasos.push({ chave: f.chave, nome: f.nome, minutos });
  }
  return atrasos;
}

export function tituloDoAviso(a: Atraso): string {
  return `Carga do Senior atrasada: ${a.nome}`;
}

export function textoDoAviso(a: Atraso): string {
  const quando = a.minutos === null ? "nunca chegou carga" : `última carga há ${a.minutos} min (o normal é a cada 10 min)`;
  return `${quando}. As telas estão mostrando dados velhos do Senior. Verifique o endereço do sistema nos scripts da VPS, o n8n e a chave de sincronização.`;
}

/** Fatia minima do banco que o vigia usa (o Prisma real cabe aqui; os testes passam um falso). */
export type BancoDoVigia = {
  tituloContasAPagar: { aggregate(args: { _max: { atualizadoEm: true } }): Promise<{ _max: { atualizadoEm: Date | null } }> };
  aprovacaoSenior: { aggregate(args: { _max: { ultimaSincEm: true } }): Promise<{ _max: { ultimaSincEm: Date | null } }> };
  user: { findMany(args: { where: { active: true; role: "ADMIN" }; select: { id: true } }): Promise<{ id: string }[]> };
  notification: {
    findFirst(args: { where: { title: string; createdAt: { gte: Date } }; select: { id: true } }): Promise<{ id: string } | null>;
    createMany(args: { data: { userId: string; type: "OUTRO"; title: string; body: string; link: string }[] }): Promise<unknown>;
  };
};

/** Confere as duas cargas e avisa os administradores (sino) quando alguma estiver atrasada. Devolve os atrasos encontrados. */
export async function verificarCargas(db: BancoDoVigia, agora: Date, janelaAberta: boolean): Promise<Atraso[]> {
  if (!janelaAberta) return [];
  const [titulos, ocs] = await Promise.all([
    db.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true } }),
    db.aprovacaoSenior.aggregate({ _max: { ultimaSincEm: true } }),
  ]);
  const atrasos = fontesAtrasadas(
    agora,
    [
      { chave: "titulos", nome: "títulos a pagar", ultimaEm: titulos._max.atualizadoEm },
      { chave: "ocs", nome: "ordens de compra", ultimaEm: ocs._max.ultimaSincEm },
    ],
    janelaAberta
  );
  if (!atrasos.length) return atrasos;

  const admins = await db.user.findMany({ where: { active: true, role: "ADMIN" }, select: { id: true } });
  if (!admins.length) return atrasos;
  const desde = new Date(agora.getTime() - INTERVALO_ENTRE_AVISOS_MS);
  for (const a of atrasos) {
    const titulo = tituloDoAviso(a);
    if (await db.notification.findFirst({ where: { title: titulo, createdAt: { gte: desde } }, select: { id: true } })) continue;
    await db.notification.createMany({
      data: admins.map((u) => ({ userId: u.id, type: "OUTRO" as const, title: titulo, body: textoDoAviso(a), link: "/programacao-pagamento" })),
    });
  }
  return atrasos;
}
