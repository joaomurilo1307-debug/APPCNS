// Vinculo Titulo <-> OC como a Senior o registra (somente leitura, mesmas credenciais do GetDBInfo):
//  - NF: a OC gravada nos itens da NF de compra (E440IPC / E440ISC .NUMOCP); o titulo chega a ela pelo NUMNFC.
//  - TITULO: E501TCP.USU_NUMOCP, campo de usuario do proprio titulo.
// Colunas confirmadas contra o tenant em 30/10/2026. Cada passada leva poucos segundos (~4,4 mil itens com OC).

import { prisma } from "@/lib/prisma";
import { consultarSenior } from "./getDbInfo";

const INTERVALO_MS = 15 * 60 * 1000;
let emAndamento: Promise<void> | null = null;
let ultimaExecucao = 0;

const positivo = (v: string | undefined) => !!v && /^\d+$/.test(v.trim()) && Number(v) > 0;

export async function atualizarVinculosOc(): Promise<number> {
  const [ipc, isc, titulos] = await Promise.all([
    consultarSenior("SELECT CODFIL, CODFOR, NUMNFC, NUMOCP FROM E440IPC WHERE NUMOCP > 0"),
    consultarSenior("SELECT CODFIL, CODFOR, NUMNFC, NUMOCP FROM E440ISC WHERE NUMOCP > 0"),
    consultarSenior("SELECT CODFIL, CODFOR, NUMTIT, USU_NUMOCP FROM E501TCP WHERE USU_NUMOCP > 0"),
  ]);

  const unicos = new Map<string, { origem: string; codFil: string; codFor: string; chave: string; numOcp: string }>();
  const add = (origem: string, codFil: string, codFor: string, chave: string, numOcp: string) => {
    unicos.set([origem, codFil, codFor, chave, numOcp].join("|"), { origem, codFil, codFor, chave, numOcp });
  };
  for (const l of [...ipc, ...isc]) if (positivo(l.NUMOCP) && l.NUMNFC) add("NF", l.CODFIL, l.CODFOR, l.NUMNFC, String(Number(l.NUMOCP)));
  for (const l of titulos) if (positivo(l.USU_NUMOCP) && l.NUMTIT) add("TITULO", l.CODFIL, l.CODFOR, l.NUMTIT, String(Number(l.USU_NUMOCP)));

  // So' troca a tabela depois das tres leituras darem certo: falha da Senior nunca apaga o que ja temos.
  await prisma.$transaction([
    prisma.vinculoOcSenior.deleteMany(),
    prisma.vinculoOcSenior.createMany({ data: [...unicos.values()] }),
  ]);
  return unicos.size;
}

/** Dispara em segundo plano (no maximo uma por vez, a cada 15 min). Falha so' vai pro log. */
export function garantirVinculosOcAtualizados(): Promise<void> | null {
  if (!process.env.SENIOR_WS_SAPIENS_USER || !process.env.SENIOR_WS_SAPIENS_PASSWORD) return null;
  if (emAndamento) return emAndamento;
  if (Date.now() - ultimaExecucao < INTERVALO_MS) return null;
  ultimaExecucao = Date.now();
  emAndamento = atualizarVinculosOc()
    .then(() => undefined)
    .catch((e) => {
      ultimaExecucao = 0; // tenta de novo no proximo acesso
      console.error("[vinculosOc]", String(e?.message ?? e).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
    })
    .finally(() => { emAndamento = null; });
  return emAndamento;
}

export function carregarVinculosOc(db: typeof prisma) {
  return db.vinculoOcSenior.findMany({ select: { origem: true, codFil: true, codFor: true, chave: true, numOcp: true } });
}
