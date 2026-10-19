import { NextResponse } from "next/server";
import os from "os";
import { performance } from "perf_hooks";
import { prisma } from "@/lib/prisma";
import { motorDeOcs } from "@/lib/cache/ocsMotor";
import { lancamentosDeTitulos } from "@/lib/contratos/titulosPrevistos";

// ROTA TEMPORARIA DE MEDICAO (somente leitura, nao toca no Senior), protegida por x-sync-key. Sera removida apos o uso.
// Mede, na maquina real, quanto custa cada parte do que a Programacao de Pagamento e a Previsao fazem a cada abertura.

const autorizado = (req: Request) => {
  const chave = req.headers.get("x-sync-key");
  return !!chave && chave === process.env.SENIOR_SYNC_KEY;
};
const ms = (t0: number) => Math.round(performance.now() - t0);

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const out: Record<string, unknown> = {};
  const elu = performance.eventLoopUtilization();
  out.processo = { uptimeMin: Math.round(process.uptime() / 60), eventLoopUtilizadoDesdeOBoot: Math.round(elu.utilization * 1000) / 1000, memoriaMB: Math.round(process.memoryUsage().rss / 1048576), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), loadavg: os.loadavg().map((x) => Math.round(x * 100) / 100), cpus: os.cpus().length };

  let t = performance.now();
  const titulos = await prisma.tituloContasAPagar.findMany({ orderBy: [{ pago: "asc" }, { vencimentoProgramado: "asc" }] });
  out.titulos = { n: titulos.length, leituraMs: ms(t) };

  t = performance.now();
  const frio = await motorDeOcs(prisma);
  out.motorOcsFrio = { ocs: frio.ocs.length, ms: ms(t) };
  t = performance.now();
  await motorDeOcs(prisma);
  out.motorOcsQuente = { ms: ms(t) };

  t = performance.now();
  let comOc = 0;
  for (const x of titulos) if (frio.motor.ocRelacionadaDe(x).ocRelacionada) comOc++;
  out.vinculoTituloOc = { titulos: titulos.length, comOc, ms: ms(t) };

  t = performance.now();
  const json = JSON.stringify(titulos);
  out.jsonDosTitulos = { bytes: json.length, ms: ms(t) };

  t = performance.now();
  const lanc = await lancamentosDeTitulos(prisma, { somenteAbertos: false });
  out.lancamentosFrio = { itens: lanc.itens.length, ms: ms(t) };
  t = performance.now();
  await lancamentosDeTitulos(prisma, { somenteAbertos: false });
  out.lancamentosQuente = { ms: ms(t) };

  t = performance.now();
  const tabelas = await prisma.$queryRawUnsafe<{ tabela: string; linhas: bigint; mb: number }[]>(
    `SELECT relname AS tabela, n_live_tup AS linhas, (pg_total_relation_size(relid) / 1048576.0)::float AS mb FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`
  );
  out.tabelasMaiores = tabelas.map((x) => `${x.tabela}: ${Number(x.linhas)} linhas, ${Math.round(x.mb)} MB`);
  const [ativ] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database()`);
  const [tam] = await prisma.$queryRawUnsafe<{ mb: number }[]>(`SELECT (pg_database_size(current_database()) / 1048576.0)::float AS mb`);
  out.banco = { conexoes: Number(ativ.n), tamanhoMB: Math.round(tam.mb), consultasMs: ms(t) };
  return NextResponse.json(out);
}
