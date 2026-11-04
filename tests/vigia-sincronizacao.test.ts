import { test } from "node:test";
import assert from "node:assert/strict";
import { fontesAtrasadas, textoDoAviso, tituloDoAviso, verificarCargas, INTERVALO_ENTRE_AVISOS_MS, type BancoDoVigia } from "../src/lib/vigia/sincronizacao";

const AGORA = new Date("2026-10-29T20:00:00Z");
const minAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000);

/** Banco falso: so' o que o vigia usa; guarda os avisos criados para o teste conferir. */
function bancoFalso(opts: { titulos: Date | null; ocs: Date | null; admins?: string[]; avisosAntigos?: { title: string; createdAt: Date }[] }) {
  const criados: { userId: string; title: string; body: string; link: string }[] = [];
  const existentes = [...(opts.avisosAntigos ?? [])];
  const db: BancoDoVigia = {
    tituloContasAPagar: { aggregate: async () => ({ _max: { atualizadoEm: opts.titulos } }) },
    aprovacaoSenior: { aggregate: async () => ({ _max: { ultimaSincEm: opts.ocs } }) },
    user: { findMany: async () => (opts.admins ?? ["u-joao", "u-gabriel"]).map((id) => ({ id })) },
    notification: {
      findFirst: async ({ where }) => (existentes.some((n) => n.title === where.title && n.createdAt >= where.createdAt.gte) ? { id: "x" } : null),
      createMany: async ({ data }) => {
        for (const d of data) {
          criados.push({ userId: d.userId, title: d.title, body: d.body, link: d.link });
          existentes.push({ title: d.title, createdAt: AGORA });
        }
      },
    },
  };
  return { db, criados };
}

test("cargas em dia (10 min): nada a avisar e nenhum aviso criado", async () => {
  const { db, criados } = bancoFalso({ titulos: minAtras(10), ocs: minAtras(3) });
  assert.deepEqual(await verificarCargas(db, AGORA, true), []);
  assert.equal(criados.length, 0);
});

test("limite: 45 min ainda e' normal, 46 min e' atraso", () => {
  const f = (m: number) => [{ chave: "titulos" as const, nome: "títulos a pagar", ultimaEm: minAtras(m) }];
  assert.deepEqual(fontesAtrasadas(AGORA, f(45), true), []);
  assert.deepEqual(fontesAtrasadas(AGORA, f(46), true).map((a) => a.minutos), [46]);
});

test("falha 1 — titulos parados ha 140 min (caso real da troca de dominio): avisa cada administrador, so' de titulos", async () => {
  const { db, criados } = bancoFalso({ titulos: minAtras(140), ocs: minAtras(5) });
  const atrasos = await verificarCargas(db, AGORA, true);
  assert.deepEqual(atrasos.map((a) => [a.chave, a.minutos]), [["titulos", 140]]);
  assert.deepEqual(criados.map((c) => c.userId).sort(), ["u-gabriel", "u-joao"]);
  assert.ok(criados.every((c) => c.title === "Carga do Senior atrasada: títulos a pagar" && c.link === "/programacao-pagamento"));
  assert.match(criados[0].body, /última carga há 140 min/);
});

test("falha 2 — o mesmo atraso nao reenvia o aviso dentro de 3 h, mas volta a avisar depois disso", async () => {
  const aviso = { title: "Carga do Senior atrasada: ordens de compra", createdAt: new Date(AGORA.getTime() - 60 * 60_000) };
  const { db, criados } = bancoFalso({ titulos: minAtras(5), ocs: minAtras(200), avisosAntigos: [aviso] });
  await verificarCargas(db, AGORA, true);
  assert.equal(criados.length, 0, "aviso de 1 h atras ainda vale");

  const velho = { ...aviso, createdAt: new Date(AGORA.getTime() - INTERVALO_ENTRE_AVISOS_MS - 60_000) };
  const outro = bancoFalso({ titulos: minAtras(5), ocs: minAtras(200), avisosAntigos: [velho] });
  await verificarCargas(outro.db, AGORA, true);
  assert.equal(outro.criados.length, 2, "aviso de mais de 3 h atras: avisa de novo (os 2 administradores)");
});

test("falha 3 — fora do horario de trabalho (noite/domingo) nao e' atraso e nao consulta nem avisa", async () => {
  const { db, criados } = bancoFalso({ titulos: minAtras(600), ocs: minAtras(600) });
  assert.deepEqual(await verificarCargas(db, AGORA, false), []);
  assert.equal(criados.length, 0);
});

test("falha 4 — base sem nenhuma carga (nunca chegou): conta como atraso e a mensagem diz isso", async () => {
  const { db, criados } = bancoFalso({ titulos: null, ocs: null });
  const atrasos = await verificarCargas(db, AGORA, true);
  assert.deepEqual(atrasos.map((a) => a.minutos), [null, null]);
  assert.match(criados[0].body, /nunca chegou carga/);
});

test("falha 5 — as duas fontes atrasadas geram um aviso para cada fonte; sem administradores nao cria nada e nao quebra", async () => {
  const { db, criados } = bancoFalso({ titulos: minAtras(90), ocs: minAtras(90), admins: ["u1"] });
  await verificarCargas(db, AGORA, true);
  assert.deepEqual(criados.map((c) => c.title).sort(), ["Carga do Senior atrasada: ordens de compra", "Carga do Senior atrasada: títulos a pagar"]);

  const vazio = bancoFalso({ titulos: minAtras(90), ocs: minAtras(90), admins: [] });
  assert.equal((await verificarCargas(vazio.db, AGORA, true)).length, 2);
  assert.equal(vazio.criados.length, 0);
});

test("textos do aviso", () => {
  const a = { chave: "titulos" as const, nome: "títulos a pagar", minutos: 61 };
  assert.equal(tituloDoAviso(a), "Carga do Senior atrasada: títulos a pagar");
  assert.match(textoDoAviso(a), /há 61 min \(o normal é a cada 10 min\)/);
});
