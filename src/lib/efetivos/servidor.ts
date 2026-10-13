// Apoio das rotas /api/efetivos: nivel de acesso, carga dos dados e mascara de dado sensivel.
// Quem edita (monta/movimenta equipes) e so EDITOR (o Samuel) ou ADMIN; DASHBOARD so consulta.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { alocacoesQueSeguram, type Dia } from "./disponibilidade";

export type NivelEfetivos = "ADMIN" | "EDITOR" | "DASHBOARD";

export const diaDe = (d: Date | null | undefined): Dia | null => (d ? d.toISOString().slice(0, 10) : null);
export const dataDe = (dia: Dia): Date => new Date(`${dia}T00:00:00.000Z`);

export async function nivelDoUsuario(userId: string, role: string | undefined): Promise<NivelEfetivos | null> {
  if (role === "ADMIN") return "ADMIN";
  const a = await prisma.efetivoAcesso.findUnique({ where: { userId } });
  return a && (a.nivel === "EDITOR" || a.nivel === "DASHBOARD") ? a.nivel : null;
}

export const podeEditar = (n: NivelEfetivos | null) => n === "ADMIN" || n === "EDITOR";

type Exigencia = "ver" | "editar" | "admin";

/** Autentica e confere o nivel; devolve a resposta de erro pronta quando nao pode. */
export async function exigir(
  exigencia: Exigencia
): Promise<{ erro: NextResponse } | { userId: string; nome: string; nivel: NivelEfetivos }> {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const u = session.user as any;
  const nivel = await nivelDoUsuario(u.id, u.role);
  const ok = exigencia === "ver" ? nivel !== null : exigencia === "editar" ? podeEditar(nivel) : nivel === "ADMIN";
  if (!ok || !nivel) {
    return {
      erro: NextResponse.json(
        { error: exigencia === "ver" ? "Sem acesso ao controle de efetivos" : "Somente quem monta as equipes pode alterar" },
        { status: 403 }
      ),
    };
  }
  return { userId: u.id, nome: u.name ?? u.email ?? "Usuário", nivel };
}

export async function registrar(userId: string, acao: string, entidade: string, entidadeId: string | undefined, resumo: string, extra?: Record<string, unknown>) {
  await logAudit({ userId, action: `EFETIVOS_${acao}`, entityType: `EFETIVO_${entidade}`, entityId: entidadeId, metadata: { resumo, ...extra } });
}

// Status de saude/afastamento aparecem para o painel como simples "Indisponível" (LGPD).
const STATUS_SENSIVEIS = ["Afastado", "Apto com restrição"];

export type DadosBrutos = Awaited<ReturnType<typeof carregarDados>>;

export async function carregarDados(editor: boolean) {
  const [equipes, vagas, ausencias, campanhas, alocacoes, veiculos, movimentos] = await Promise.all([
    prisma.efetivoEquipe.findMany({ orderBy: [{ ordem: "asc" }, { codigo: "asc" }] }),
    prisma.efetivoVaga.findMany({ orderBy: [{ numero: "asc" }, { criadoEm: "asc" }] }),
    prisma.efetivoAusencia.findMany({ orderBy: { inicio: "asc" } }),
    prisma.efetivoCampanha.findMany({ orderBy: [{ inicio: "asc" }, { codigo: "asc" }] }),
    prisma.efetivoAlocacao.findMany(),
    prisma.efetivoVeiculo.findMany({ orderBy: { codigo: "asc" } }),
    prisma.efetivoVeiculoMovimento.findMany({ orderBy: { inicio: "asc" } }),
  ]);
  return {
    equipes: equipes.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome, projeto: e.projeto, gestor: e.gestor, grupo: e.grupo, status: e.status })),
    vagas: vagas.map((v) => ({
      id: v.id,
      numero: v.numero,
      equipeId: v.equipeId,
      nome: v.nome,
      status: editor || !STATUS_SENSIVEIS.includes(v.status) ? v.status : "Indisponível",
      cargo: v.cargo,
      empresa: v.empresa,
      atividade: v.atividade,
      previsaoInicio: diaDe(v.previsaoInicio),
      nivel: v.nivel,
      direcao4x4: v.direcao4x4,
      contratoAtual: v.contratoAtual,
      disponivelAPartir: diaDe(v.disponivelAPartir),
      destino: v.destino,
      observacao: editor ? v.observacao : null,
    })),
    ausencias: ausencias.map((a) => ({
      id: a.id,
      vagaId: a.vagaId,
      tipo: editor ? a.tipo : "Ausente",
      inicio: diaDe(a.inicio)!,
      fim: diaDe(a.fim)!,
      observacao: editor ? a.observacao : null,
    })),
    campanhas: campanhas.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      recebidaEm: diaDe(c.recebidaEm),
      solicitante: c.solicitante,
      projeto: c.projeto,
      grupo: c.grupo,
      atividade: c.atividade,
      local: c.local,
      inicio: diaDe(c.inicio)!,
      fim: diaDe(c.fim)!,
      qtdEquipes: c.qtdEquipes,
      prioridade: c.prioridade,
      status: c.status,
      observacao: c.observacao,
    })),
    alocacoes: alocacoes.map((a) => ({ id: a.id, campanhaId: a.campanhaId, vagaId: a.vagaId, inicio: diaDe(a.inicio)!, fim: diaDe(a.fim)! })),
    veiculos: veiculos.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      identificacao: v.identificacao,
      placa: v.placa,
      modelo: v.modelo,
      tracao4x4: v.tracao4x4,
      status: v.status,
      observacao: v.observacao,
    })),
    movimentos: movimentos.map((m) => ({
      id: m.id,
      veiculoId: m.veiculoId,
      inicio: diaDe(m.inicio)!,
      fim: diaDe(m.fim),
      projeto: m.projeto,
      equipeId: m.equipeId,
      campanhaId: m.campanhaId,
      local: m.local,
      observacao: m.observacao,
    })),
  };
}

/** Dados no formato que a regra de disponibilidade espera (so alocacoes que seguram gente). */
export async function dadosParaRegra() {
  const d = await carregarDados(true);
  return {
    brutos: d,
    regra: {
      equipes: d.equipes,
      vagas: d.vagas.map((v) => ({ ...v, previsaoInicio: v.previsaoInicio })),
      ausencias: d.ausencias,
      alocacoes: alocacoesQueSeguram(d.alocacoes, d.campanhas),
    },
  };
}
