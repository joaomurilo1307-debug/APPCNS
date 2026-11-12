// Busca de dados na Senior feita pelo proprio sistema (12/11/2026): titulos e OCs.
//
// Uma busca por fonte de cada vez (o botao clicado no meio de uma busca acompanha a que ja esta rodando), estado gravado em
// SincronizacaoSenior (inicio, fim, quantidade, falha) para a tela mostrar o que aconteceu de verdade, e a gravacao de cada
// fonte passa por uma trava compartilhada com as rotas que ainda recebem o envio externo (script do VPS via n8n).
// Titulos tem dois modos: RAPIDA (abertos, demais situacoes e os que sairam de aberto; ~1-2 min; botao e rodadas de 10 min)
// e COMPLETA (historico inteiro com limpeza; ~15 min; de madrugada -- ver agendador.ts).
// O registro em memoria fica em globalThis: o agendador (instrumentation) e as rotas podem carregar copias diferentes deste
// modulo, e as duas precisam ver a mesma busca em andamento.

import { prisma } from "@/lib/prisma";
import { consultarSeniorForaDaFila } from "../getDbInfo";
import { lerOcsDaSenior, montarItensOc, ocsAcompanhadas, processarAprovacoes } from "./aprovacoes";
import { situacaoDasPessoas } from "./pessoasAtivas";
import { lerTitulosDaSenior, lerTitulosRecentesDaSenior, processarTitulos, removerTitulos, type Consultar } from "./titulos";
import { processarUsuarios } from "./usuarios";

export const FONTES = ["titulos", "ocs"] as const;
export type Fonte = (typeof FONTES)[number];
export type Origem = "AGENDADOR" | "BOTAO" | "EXTERNO";
export type ModoTitulos = "rapida" | "completa";
/** Linha extra de SincronizacaoSenior com o fim da ultima busca COMPLETA de titulos. */
export const FONTE_COMPLETA = "titulos-completa";

type Execucao = { iniciadaEm: Date; etapa: string; modo: ModoTitulos | null; promessa: Promise<void> };
type Registro = { execucoes: Map<Fonte, Execucao>; travas: Map<Fonte, Promise<unknown>> };
const registro: Registro = ((globalThis as { __seniorSync?: Registro }).__seniorSync ??= { execucoes: new Map(), travas: new Map() });

/** Uma gravacao por fonte de cada vez (busca interna e envio externo na mesma fila). */
export function comTravaDeGravacao<T>(fonte: Fonte, fn: () => Promise<T>): Promise<T> {
  const anterior = registro.travas.get(fonte) ?? Promise.resolve();
  const atual = anterior.then(fn, fn);
  registro.travas.set(fonte, atual.then(() => undefined, () => undefined));
  return atual;
}

/** Erro que vale tentar de novo: tempo esgotado, conexao caida, Senior sobrecarregada. Recusa da consulta nao entra. */
export function falhaPassageira(e: unknown): boolean {
  const err = e as { name?: string; message?: string; cause?: { code?: string } };
  const texto = `${err?.name ?? ""} ${err?.message ?? ""} ${err?.cause?.code ?? ""}`;
  return /TimeoutError|AbortError|aborted|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket|HTTP (429|502|503|504)/i.test(texto);
}

/** Ate 3 tentativas por consulta, com pausa crescente, so' para falha passageira. */
export function comNovasTentativas(consultar: Consultar, esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Consultar {
  return async (sql, opcoes) => {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await consultar(sql, opcoes);
      } catch (e) {
        if (tentativa >= 3 || !falhaPassageira(e)) throw e;
        await esperar(3000 * tentativa);
      }
    }
  };
}

function mensagemDeFalha(e: unknown, etapa: string): string {
  const texto = String((e as Error)?.message ?? e).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (/SENIOR_WS_SAPIENS_USER|SENIOR_WS_SAPIENS_PASSWORD/.test(texto)) return "A credencial da Senior não está configurada no servidor do sistema.";
  if (/TimeoutError|aborted due to timeout/i.test(`${(e as Error)?.name} ${texto}`)) return `A Senior não respondeu a tempo (${etapa}), mesmo tentando de novo.`;
  if (/fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(texto)) return `Sem conexão com a Senior (${etapa}), mesmo tentando de novo.`;
  if (/senha|password|usu[aá]rio|autentica|login/i.test(texto)) return `A Senior recusou a credencial do sistema (${etapa}): ${texto.slice(0, 200)}`;
  return `${etapa}: ${texto.slice(0, 300)}`;
}

export type ResumoBusca = { quantidade: number; removidos?: number; aviso?: string | null };

// Protecao das limpezas: muita coisa sumindo de uma vez indica leitura incompleta, nao titulos cancelados.
const MAX_SUMIDOS_RAPIDA = 200;

async function buscarTitulos(consultar: Consultar, exec: Execucao): Promise<ResumoBusca> {
  const progresso = (etapa: string) => (exec.etapa = etapa);
  if (exec.modo === "completa") {
    const { itens, semDataEmissao } = await lerTitulosDaSenior(consultar, progresso);
    if (!itens.length) throw new Error("a Senior devolveu a lista de títulos vazia; nada foi gravado e os dados anteriores continuam");
    exec.etapa = `gravando ${itens.length.toLocaleString("pt-BR")} títulos`;
    const existentes = await prisma.tituloContasAPagar.count();
    const r = await comTravaDeGravacao("titulos", () => processarTitulos(itens, { limiteRemocao: Math.max(500, Math.round(existentes * 0.1)) }));
    const avisos = [
      r.remocaoSuspensa ? `${r.remocaoSuspensa} títulos sumiriam de uma vez; a limpeza ficou suspensa até a próxima busca completa` : null,
      semDataEmissao ? `${semDataEmissao} título(s) sem data de emissão na Senior ficaram de fora` : null,
    ].filter(Boolean);
    return { quantidade: r.processados, removidos: r.removidos, aviso: avisos.join("; ") || null };
  }

  const naoPagos = await prisma.tituloContasAPagar.findMany({
    where: { situacao: { not: "LQ" } },
    select: { numTit: true, codFil: true, codFor: true, tipo: true, dataEmissao: true },
  });
  const { itens, semDataEmissao, sumiram } = await lerTitulosRecentesDaSenior(consultar, naoPagos, progresso);
  if (!itens.length) throw new Error("a Senior devolveu a lista de títulos em aberto vazia; nada foi gravado e os dados anteriores continuam");
  exec.etapa = `gravando ${itens.length.toLocaleString("pt-BR")} títulos`;
  const r = await comTravaDeGravacao("titulos", async () => {
    const gravados = await processarTitulos(itens, { limpar: false });
    const removidos = sumiram.length <= MAX_SUMIDOS_RAPIDA ? await removerTitulos(sumiram) : 0;
    return { ...gravados, removidos };
  });
  const avisos = [
    sumiram.length > MAX_SUMIDOS_RAPIDA ? `${sumiram.length} títulos sumiriam de uma vez; ficaram para a busca completa` : null,
    semDataEmissao ? `${semDataEmissao} título(s) sem data de emissão na Senior ficaram de fora` : null,
  ].filter(Boolean);
  return { quantidade: r.processados, removidos: r.removidos, aviso: avisos.join("; ") || null };
}

async function buscarOcs(consultar: Consultar, exec: Execucao): Promise<ResumoBusca> {
  const acompanhadas = await ocsAcompanhadas();
  const { dados, usuarios } = await lerOcsDaSenior(consultar, acompanhadas, (etapa) => (exec.etapa = etapa));
  exec.etapa = "conferindo quem está desligado";
  const pessoas = await situacaoDasPessoas();
  const itens = montarItensOc(dados, pessoas.ativo);
  if (!itens.length) throw new Error("a Senior devolveu a lista de OCs vazia; nada foi gravado");
  exec.etapa = "gravando usuários da Senior";
  await processarUsuarios(usuarios);
  exec.etapa = `gravando ${itens.length.toLocaleString("pt-BR")} OCs`;
  const r = await comTravaDeGravacao("ocs", () => processarAprovacoes(itens));
  return { quantidade: r.totalRecebido, aviso: pessoas.fonte === "FOLHA" ? null : `Desligados: ${pessoas.detalhe}` };
}

async function executar(fonte: Fonte, origem: Origem, pedidaPor: string | null, exec: Execucao, consultar: Consultar) {
  const t0 = Date.now();
  await prisma.sincronizacaoSenior
    .upsert({
      where: { fonte },
      create: { fonte, iniciadaEm: exec.iniciadaEm, origem, pedidaPorNome: pedidaPor, modo: exec.modo },
      update: { iniciadaEm: exec.iniciadaEm, origem, pedidaPorNome: pedidaPor, modo: exec.modo },
    })
    .catch((e) => console.error(`[senior-sync] ${fonte}: estado nao gravado`, e?.message ?? e));
  try {
    const resumo = fonte === "titulos" ? await buscarTitulos(consultar, exec) : await buscarOcs(consultar, exec);
    const fim = new Date();
    await prisma.sincronizacaoSenior.update({
      where: { fonte },
      data: { sucessoEm: fim, quantidade: resumo.quantidade, removidos: resumo.removidos ?? null, aviso: resumo.aviso ?? null, duracaoMs: Date.now() - t0, modoConcluido: exec.modo },
    });
    if (fonte === "titulos" && exec.modo === "completa") {
      await prisma.sincronizacaoSenior.upsert({
        where: { fonte: FONTE_COMPLETA },
        create: { fonte: FONTE_COMPLETA, iniciadaEm: exec.iniciadaEm, origem, sucessoEm: fim, quantidade: resumo.quantidade, duracaoMs: Date.now() - t0, modo: "completa" },
        update: { iniciadaEm: exec.iniciadaEm, origem, sucessoEm: fim, quantidade: resumo.quantidade, duracaoMs: Date.now() - t0 },
      });
    }
    console.log(`[senior-sync] ${fonte}${exec.modo ? ` (${exec.modo})` : ""}: ${resumo.quantidade} gravados em ${Math.round((Date.now() - t0) / 1000)} s (${origem})`);
  } catch (e) {
    const falha = mensagemDeFalha(e, exec.etapa);
    console.error(`[senior-sync] ${fonte}${exec.modo ? ` (${exec.modo})` : ""}: ${falha}`);
    await prisma.sincronizacaoSenior
      .update({ where: { fonte }, data: { falhaEm: new Date(), falha, duracaoMs: Date.now() - t0 } })
      .catch((e2) => console.error(`[senior-sync] ${fonte}: falha nao gravada`, e2?.message ?? e2));
  }
}

/**
 * Comeca a busca da fonte em segundo plano e volta na hora. Se ja houver uma rodando, nao comeca outra: devolve a que esta
 * em andamento (a tela acompanha essa). `modo` so' vale para titulos. `consultar` so' muda em teste.
 */
export function iniciarSincronizacao(
  fonte: Fonte,
  origem: Origem,
  pedidaPor: string | null = null,
  consultar: Consultar = comNovasTentativas(consultarSeniorForaDaFila),
  modo: ModoTitulos = "rapida"
): { iniciadaEm: Date; jaEmAndamento: boolean; modo: ModoTitulos | null } {
  const atual = registro.execucoes.get(fonte);
  if (atual) return { iniciadaEm: atual.iniciadaEm, jaEmAndamento: true, modo: atual.modo };
  const exec: Execucao = { iniciadaEm: new Date(), etapa: "começando", modo: fonte === "titulos" ? modo : null, promessa: Promise.resolve() };
  registro.execucoes.set(fonte, exec);
  exec.promessa = executar(fonte, origem, pedidaPor, exec, consultar).finally(() => registro.execucoes.delete(fonte));
  return { iniciadaEm: exec.iniciadaEm, jaEmAndamento: false, modo: exec.modo };
}

export async function aguardarSincronizacao(fonte: Fonte): Promise<void> {
  await registro.execucoes.get(fonte)?.promessa;
}

/** Envio externo (rotas /sync) concluido: conta como dado novo recebido. */
export async function registrarRecebimentoExterno(fonte: Fonte, quantidade: number) {
  if (quantidade <= 0) return;
  await prisma.sincronizacaoSenior
    .upsert({
      where: { fonte },
      create: { fonte, iniciadaEm: new Date(), origem: "EXTERNO", sucessoEm: new Date(), quantidade },
      update: { sucessoEm: new Date(), quantidade, removidos: null, modoConcluido: null, aviso: "recebido do envio externo (servidor do n8n)" },
    })
    .catch((e) => console.error(`[senior-sync] ${fonte}: recebimento externo nao gravado`, e?.message ?? e));
}

export type EstadoFonte = {
  fonte: Fonte;
  emAndamento: boolean;
  etapa: string | null;
  /** Modo da busca em andamento (titulos). */
  modo: ModoTitulos | null;
  iniciadaEm: string | null;
  origem: string | null;
  sucessoEm: string | null;
  /** Modo da ultima busca concluida (titulos): rapida ou completa. */
  modoConcluido: string | null;
  quantidade: number | null;
  removidos: number | null;
  aviso: string | null;
  duracaoMs: number | null;
  falhaEm: string | null;
  falha: string | null;
  /** Fim da ultima busca completa de titulos (historico de pagos inteiro). */
  ultimaCompletaEm: string | null;
  /** Comecou e nao terminou (o sistema reiniciou no meio): a proxima busca refaz. */
  interrompida: boolean;
};

export async function estadoDasSincronizacoes(): Promise<EstadoFonte[]> {
  const linhas = await prisma.sincronizacaoSenior.findMany();
  const completa = linhas.find((x) => x.fonte === FONTE_COMPLETA);
  return FONTES.map((fonte) => {
    const l = linhas.find((x) => x.fonte === fonte);
    const exec = registro.execucoes.get(fonte);
    const ini = l?.iniciadaEm?.getTime() ?? 0;
    const interrompida = !exec && !!l?.iniciadaEm && (l.sucessoEm?.getTime() ?? 0) < ini && (l.falhaEm?.getTime() ?? 0) < ini;
    return {
      fonte,
      emAndamento: !!exec,
      etapa: exec?.etapa ?? null,
      modo: exec?.modo ?? null,
      iniciadaEm: (exec?.iniciadaEm ?? l?.iniciadaEm)?.toISOString() ?? null,
      origem: l?.origem ?? null,
      sucessoEm: l?.sucessoEm?.toISOString() ?? null,
      modoConcluido: l?.modoConcluido ?? null,
      quantidade: l?.quantidade ?? null,
      removidos: l?.removidos ?? null,
      aviso: l?.aviso ?? null,
      duracaoMs: l?.duracaoMs ?? null,
      falhaEm: l?.falhaEm?.toISOString() ?? null,
      falha: l?.falha ?? null,
      ultimaCompletaEm: fonte === "titulos" ? completa?.sucessoEm?.toISOString() ?? null : null,
      interrompida,
    };
  });
}

/** Fim da ultima busca completa de titulos (null = nunca rodou). */
export async function ultimaBuscaCompleta(): Promise<Date | null> {
  return (await prisma.sincronizacaoSenior.findUnique({ where: { fonte: FONTE_COMPLETA }, select: { sucessoEm: true } }))?.sucessoEm ?? null;
}
