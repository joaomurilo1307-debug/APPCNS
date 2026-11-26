import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { lerDadosAlcada, montarAlcada, type DadosAlcada } from "@/lib/senior/alcadaCc";
import { ativoPelaFolha } from "@/lib/senior/sincronizacao/pessoasAtivas";
import { acharSeniorPorEmail } from "../../../../../prisma/achar-senior";

// Tela Aprovadores por CC (23/11/2026): toda a alcada de aprovacao de OC (rotina 12, tela F068CNA da Senior), por centro de custo e
// nivel. Lida ao vivo da Senior (so' SELECT, pela mesma fila das outras telas) e guardada 10 min na memoria: a leitura completa leva
// ~40 s. "Atualizar agora" (?atualizar=1) le de novo, no maximo uma vez por minuto. Mesmo acesso da tela Aprovacoes (OC Senior).
const VALIDADE_MS = 10 * 60_000;
const INTERVALO_MINIMO_MS = 60_000;

type Guardado = { dados: DadosAlcada; lidoEm: Date };
const estado = ((globalThis as { __alcadaCc?: { guardado: Guardado | null; lendo: Promise<Guardado> | null } }).__alcadaCc ??= {
  guardado: null,
  lendo: null,
});

function lerDaSenior(): Promise<Guardado> {
  if (!estado.lendo) {
    estado.lendo = lerDadosAlcada((sql, opcoes) => consultarSenior(sql, opcoes))
      .then((dados) => (estado.guardado = { dados, lidoEm: new Date() }))
      .finally(() => {
        estado.lendo = null;
      });
  }
  return estado.lendo;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const negado = await negarSemModulo(session?.user as any, "aprovacoes_oc", "aprovacoes_oc_todas");
  if (negado) return negado;

  const atualizar = new URL(req.url).searchParams.get("atualizar") === "1";
  const g = estado.guardado;
  const idade = g ? Date.now() - g.lidoEm.getTime() : Infinity;
  let aviso: string | null = null;
  let atual: Guardado | null = g;
  if (!g || idade > VALIDADE_MS || (atualizar && idade > INTERVALO_MINIMO_MS)) {
    try {
      atual = await lerDaSenior();
    } catch {
      if (!g) return NextResponse.json({ error: "Não consegui ler a alçada na Senior agora. Tente de novo em instantes." }, { status: 502 });
      aviso = "A Senior não respondeu agora; a tela mostra a última leitura.";
    }
  }
  if (!atual) return NextResponse.json({ error: "Não consegui ler a alçada na Senior agora." }, { status: 502 });

  // Folha guardada pela busca de OCs (RosterAtivoSenior) e vinculo pessoa x usuario do Senior: so' leitura do banco do sistema.
  // Sem esses dados a tela funciona igual, so' sem as colunas "Folha" e "No sistema" preenchidas.
  let ativoNaFolha: ((login: string) => boolean) | null = null;
  let folhaEm: Date | null = null;
  const pessoaNoSistema = new Map<string, string>();
  try {
    const folha = await prisma.rosterAtivoSenior.findUnique({ where: { id: "atual" } });
    if (folha) {
      const nomes = JSON.parse(folha.nomes);
      if (Array.isArray(nomes) && nomes.length) {
        ativoNaFolha = ativoPelaFolha(nomes.map(String));
        folhaEm = folha.capturadoEm;
      }
    }
  } catch {
    // sem folha guardada
  }
  try {
    // Mesma regra de codigosDoSenior (quem ve as OCs daquele aprovador): o vinculo manual; sem nenhum manual, o automatico por e-mail.
    const [pessoas, manuais, seniores] = await Promise.all([
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
      prisma.vinculoSenior.findMany({ select: { userId: true, codigo: true } }),
      prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true, email: true } }),
    ]);
    const manuaisDe = new Map<string, string[]>();
    for (const v of manuais) manuaisDe.set(v.userId, [...(manuaisDe.get(v.userId) ?? []), v.codigo]);
    const nomesPorCodigo = new Map<string, string[]>();
    for (const p of pessoas) {
      const auto = manuaisDe.has(p.id) || !p.email ? null : acharSeniorPorEmail(p.email, seniores);
      for (const c of manuaisDe.get(p.id) ?? (auto ? [auto.codigo] : [])) nomesPorCodigo.set(c, [...(nomesPorCodigo.get(c) ?? []), p.name]);
    }
    for (const [c, nomes] of nomesPorCodigo) pessoaNoSistema.set(c, nomes.sort((a, b) => a.localeCompare(b, "pt-BR")).join(", "));
  } catch {
    // sem vinculos
  }

  return NextResponse.json({
    linhas: montarAlcada(atual.dados, { ativoNaFolha, pessoaNoSistema }),
    lidoEm: atual.lidoEm,
    folhaEm,
    aviso,
  });
}
