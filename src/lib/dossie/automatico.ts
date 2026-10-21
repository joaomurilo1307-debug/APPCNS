// Geracao AUTOMATICA dos dossies de OC pelo proprio APPCNS. Substitui os dois gatilhos que ainda viviam no n8n:
//   - "Disparo Dossie pelo 201" (todo dia 06h): lia os titulos da E501TCP EMITIDOS ontem/hoje, so' da FILIAL 1, em
//     AB/LQ, achava a OC pelo texto USU_NUMTIT e chamava o fluxo do dossie uma vez por titulo;
//   - o vigia de "OC quitada" (origem VIGIA_OC_QUITADA).
// Por que o n8n deixava dossies sem gerar (lido do proprio fluxo exportado): so' entrava titulo com emissao nas
// ultimas 24 h (titulo lancado dias depois da nota nunca entrava), so' a filial 1, so' AB/LQ (titulo em PE ficava
// de fora), uma falha da Senior as 06h derrubava o dia inteiro sem nova tentativa, e titulo cujo numero o comprador
// nao digitou na OC era descartado sem deixar registro.
//
// Aqui o criterio e' a OC, nao a emissao do titulo, e e' reavaliado a cada poucos minutos:
//   ELEGIVEL = OC aprovada (SITAPR=APR) e nao cancelada (SITOCP<>5) que
//     (a) tem titulo ABERTO na Senior (AB/PE) citado em USU_NUMTIT, ou associado a mao na Programacao de Pagamento, ou
//     (b) vence (USU_DATVECT) de N dias atras a N dias a frente (padrao 30 / 45), ou
//     (c) ja' esta PAGA (marca AprovacaoSenior.pago) e venceu ate 90 dias atras -- o dossie final do antigo vigia de OC quitada.
//   Para cada elegivel compara o dossie guardado com o estado atual ("assinatura" = aprovacao, situacao, valor, titulos e NF
//   digitados e quais titulos ainda estao abertos): sem dossie -> gera; PDF sumiu -> gera; falhou -> tenta de novo com
//   intervalo crescente (5 min ... 24 h, nunca desiste); mudou (titulo novo, titulo pago, NF, valor) -> gera de novo.
// So' LEITURA na Senior. Uma geracao por vez (fila unica); cada ciclo gera no maximo `lote` dossies.

import { createHash } from "crypto";
import { access } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadValidation";
import { consultarSenior, type LinhaSenior } from "@/lib/senior/getDbInfo";
import { COD_EMP, dataIso, numeroSenior } from "@/lib/senior/ocsConferencia";
import { chavesFornecedor, normalizarReferencia, prefixoParcela, referenciaPreenchida } from "@/lib/vinculoOcTitulo";
import { gerarEGravar } from "./gerar";
import { chaveDaOc, marcarGerando } from "./salvar";

// ---------------------------------------------------------------- tipos

export type OcAlvo = {
  numOcp: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  vencimento: string | null; // aaaa-mm-dd (USU_DATVECT)
  sitApr: string; // APR = aprovada
  sitOcp: string; // 1 aberto total, 2 parcial, 3 suspenso, 4 liquidado, 5 cancelado
  numTit: string | null; // USU_NUMTIT: o que o comprador digitou
  numNfc: string | null; // USU_NUMNFC
  valor: number;
};

export type TituloAbertoSenior = { codFil: string; numTit: string; codTpt: string; codFor: string };

export type RegistroDossie = {
  chave: string;
  numOcp: string | null;
  status: string;
  motivo: string | null;
  assinatura: string | null;
  tentativas: number;
  arquivoPath: string | null;
  titulos: string[];
  atualizadoEm: Date;
};

export type Opcoes = {
  hoje: string; // aaaa-mm-dd (Sao Paulo)
  diasAtras: number;
  diasFrente: number;
  /** OC ja' PAGA continua elegivel por mais tempo que as demais (e' o dossie final, que o antigo vigia de OC quitada gerava). */
  diasAtrasPagas: number;
  lote: number;
};

export type Acao = "GERAR" | "ADOTAR" | "OK" | "AGUARDAR";
export type Situacao = "SEM_DOSSIE" | "DESATUALIZADO" | "ERRO" | "GERANDO" | "ATUAL";

export type Decisao = { acao: Acao; situacao: Situacao; prioridade: number; motivo: string };

export type ItemDoCiclo = {
  numOcp: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  vencimento: string | null;
  situacao: Situacao;
  acao: Acao;
  motivo: string;
};

export type ResultadoCiclo = {
  iniciadoEm: string;
  terminouEm: string;
  origem: string;
  elegiveis: number;
  atuais: number;
  adotados: number;
  semDossie: number;
  desatualizados: number;
  comErro: number;
  gerando: number;
  geradosAgora: number;
  falhasAgora: number;
  interrompidoPor: string | null;
  /** O que ainda falta (sem dossie, desatualizado, com erro ou em geracao), na ordem em que sera tratado. */
  pendentes: ItemDoCiclo[];
};

// ---------------------------------------------------------------- puras

export const GERANDO_VALE_MS = 15 * 60 * 1000; // passou disso, a geracao morreu (ex.: reinicio do servidor)
const INTERVALOS_MS = [5, 15, 30, 60, 120, 240, 480, 1440].map((m) => m * 60_000);

/** Espera depois de `tentativas` falhas seguidas: 5 min, 15, 30, 1 h, 2 h, 4 h, 8 h e, dai em diante, 24 h. */
export function esperaAposFalhas(tentativas: number): number {
  return INTERVALOS_MS[Math.min(Math.max(tentativas, 1), INTERVALOS_MS.length) - 1];
}

/** Referencias de titulo que o comprador digitou na OC ("398A1 - 196$01; 52/3" -> ["398A1","196$01","52","3"]). */
export function referenciasDaOc(numTit: string | null | undefined): string[] {
  const bruto = String(numTit ?? "");
  if (!referenciaPreenchida(bruto)) return [];
  // separa ANTES de normalizar: normalizarReferencia junta quebra de linha e espaco, e a quebra de linha separa titulos
  // "/" fica de fora de proposito: muitos NUMTIT reais sao "98129/01"
  return [...new Set(bruto.split(/\r?\n|\s+-\s+|[;,|]+/).map((p) => normalizarReferencia(p)).filter((p) => referenciaPreenchida(p)))];
}

// Chaves de comparacao de UM numero de titulo: o proprio texto e, se for so' digitos, sem zeros a esquerda.
const chavesDe = (t: string): string[] => {
  const n = normalizarReferencia(t);
  return n ? [...new Set([n, /^\d+$/.test(n) ? n.replace(/^0+(?=\d)/, "") : n])] : [];
};
const sobrepoe = (a: string[], b: string[]) => a.some((x) => b.includes(x));

/**
 * O titulo (numero da Senior) e' um dos citados na OC? Mesmas camadas do vinculo OC<->titulo -- exato, parcela e base da
 * parcela -- mas SEM quebrar o numero em pedacos: "98129/01" e' um titulo so', e nao pode casar com "251795/01" so' porque
 * os dois terminam em "/01" (visto na simulacao com dados reais de 20/10/2026). Esta funcao so' decide se o PDF precisa ser
 * refeito; o vinculo que aparece para o usuario continua sendo o do motor da Programacao de Pagamento.
 */
export function tituloCitadoNaOc(referencias: string[], numTit: string): boolean {
  const doTitulo = chavesDe(numTit);
  if (!doTitulo.length) return false;
  const base = prefixoParcela(numTit); // titulo "2072$01": a OC pode ter so' "2072" ou "2072$"
  const doTituloBase = base ? chavesDe(base) : [];
  return referencias.some((r) => {
    const ref = chavesDe(r);
    if (sobrepoe(doTitulo, ref)) return true;
    if (doTituloBase.length && (sobrepoe(doTituloBase, ref) || sobrepoe(doTituloBase, chavesDe(r.replace(/[$_]+$/, ""))))) return true;
    const refBase = prefixoParcela(r); // OC "2072$01", titulo "2072"
    return !!refBase && sobrepoe(chavesDe(refBase), doTitulo);
  });
}

/** Numeros dos titulos ABERTOS (mesmo fornecedor e filial) que a OC cita, sem repeticao e em ordem. */
export function titulosAbertosDaOc(oc: Pick<OcAlvo, "numTit" | "codFor" | "codFil">, abertosDoFornecedor: TituloAbertoSenior[]): string[] {
  const referencias = referenciasDaOc(oc.numTit);
  if (!referencias.length) return [];
  const achados = abertosDoFornecedor.filter((t) => Number(t.codFil) === Number(oc.codFil) && tituloCitadoNaOc(referencias, t.numTit)).map((t) => t.numTit);
  return [...new Set(achados)].sort();
}

/** Estado da OC que, se mudar, pede um dossie novo. Curto e estavel (nao muda por reordenar texto ou espaco). */
export function assinaturaDaOc(oc: OcAlvo, titulosAbertos: string[]): string {
  const base = JSON.stringify([
    oc.sitApr,
    oc.sitOcp,
    Math.round(oc.valor * 100),
    [...referenciasDaOc(oc.numTit)].sort(), // reordenar o texto da OC nao e' mudanca
    normalizarReferencia(oc.numNfc),
    [...titulosAbertos].map((t) => normalizarReferencia(t)).sort(),
  ]);
  return createHash("sha1").update(base).digest("hex").slice(0, 16);
}

export function janelaDeVencimento(hoje: string, diasAtras: number, diasFrente: number) {
  const dia = (n: number) => new Date(new Date(`${hoje}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { de: dia(-diasAtras), ate: dia(diasFrente) };
}

export type MotivoElegivel = "TITULO_ABERTO" | "VINCULO_MANUAL" | "VENCIMENTO_NO_PERIODO" | "OC_PAGA_RECENTE";

/** Precisa de dossie? null = nao (reprovada, cancelada, ou fora do periodo e sem titulo aberto). */
export function motivoDeElegibilidade(
  oc: Pick<OcAlvo, "sitApr" | "sitOcp" | "vencimento">,
  contexto: { temTituloAberto: boolean; temVinculoManual: boolean; de: string; ate: string; paga?: boolean; dePagas?: string }
): MotivoElegivel | null {
  if (oc.sitApr !== "APR") return null;
  if (oc.sitOcp === "5") return null; // cancelada
  if (contexto.temTituloAberto) return "TITULO_ABERTO";
  if (contexto.temVinculoManual) return "VINCULO_MANUAL";
  if (oc.vencimento && oc.vencimento >= contexto.de && oc.vencimento <= contexto.ate) return "VENCIMENTO_NO_PERIODO";
  if (contexto.paga && contexto.dePagas && oc.vencimento && oc.vencimento >= contexto.dePagas && oc.vencimento <= contexto.ate) return "OC_PAGA_RECENTE";
  return null;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** O que fazer com UMA OC elegivel, dado o dossie que existe hoje (ou nao). */
export function decidir(
  oc: Pick<OcAlvo, "numTit">,
  assinatura: string,
  registro: RegistroDossie | null,
  pdfExiste: boolean,
  agora: Date
): Decisao {
  if (!registro) return { acao: "GERAR", situacao: "SEM_DOSSIE", prioridade: 1, motivo: "ainda não tem dossiê" };

  if (registro.status === "GERANDO" && agora.getTime() - registro.atualizadoEm.getTime() < GERANDO_VALE_MS) {
    return { acao: "AGUARDAR", situacao: "GERANDO", prioridade: 9, motivo: "sendo gerado agora" };
  }

  const temPdf = !!registro.arquivoPath && pdfExiste;
  const falhou = registro.status === "ERRO" || registro.status === "GERANDO"; // GERANDO velho = geracao que morreu
  if (falhou) {
    const tentativas = Math.max(registro.tentativas, 1);
    const espera = esperaAposFalhas(tentativas);
    const proxima = new Date(registro.atualizadoEm.getTime() + espera);
    if (agora < proxima) {
      return { acao: "AGUARDAR", situacao: "ERRO", prioridade: 9, motivo: `falhou ${tentativas}x; nova tentativa ${dia(proxima) === dia(agora) ? "às" : `${dia(proxima).split("-").reverse().join("/")} às`} ${hhmm(proxima)} — ${registro.motivo ?? "sem motivo registrado"}` };
    }
    return { acao: "GERAR", situacao: "ERRO", prioridade: temPdf ? 2 : 1, motivo: `tentar de novo (falhou ${tentativas}x: ${registro.motivo ?? "sem motivo registrado"})` };
  }

  if (!temPdf) {
    return { acao: "GERAR", situacao: "SEM_DOSSIE", prioridade: 1, motivo: registro.arquivoPath ? "o PDF não está mais no servidor" : "registro sem PDF" };
  }

  // PUBLICADO com PDF
  if (registro.assinatura === assinatura) return { acao: "OK", situacao: "ATUAL", prioridade: 9, motivo: "dossiê em dia" };
  if (registro.assinatura) return { acao: "GERAR", situacao: "DESATUALIZADO", prioridade: 2, motivo: "a OC mudou desde a geração do PDF (título, nota, valor ou situação)" };

  // PDF sem assinatura (feito pelo n8n ou pelo botao): adota o que existe, a menos que ele nem cite um titulo da OC.
  const faltando = referenciasDaOc(oc.numTit).filter((r) => !registro.titulos.some((t) => tituloCitadoNaOc([r], t)));
  if (faltando.length) return { acao: "GERAR", situacao: "DESATUALIZADO", prioridade: 2, motivo: `o dossiê não cita o título ${faltando.join(", ")} da OC` };
  return { acao: "ADOTAR", situacao: "ATUAL", prioridade: 9, motivo: "dossiê existente adotado" };
}

/** Mais perto de hoje primeiro; sem vencimento por ultimo. */
function distancia(vencimento: string | null, hoje: string): number {
  if (!vencimento) return Number.MAX_SAFE_INTEGER;
  return Math.abs(new Date(`${vencimento}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime());
}

// ---------------------------------------------------------------- leituras (somente leitura)

const COLUNAS_OC = "NUMOCP, CODFIL, CODFOR, VLRLIQ, SITOCP, SITAPR, USU_DATVECT, USU_NOMFOR, USU_NUMTIT, USU_NUMNFC";
const vazioSenior = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t && !/^0+$/.test(t) ? t : null;
};

export function ocDaLinha(l: LinhaSenior): OcAlvo {
  return {
    numOcp: l.NUMOCP,
    codFil: l.CODFIL,
    codFor: l.CODFOR,
    fornecedorNome: vazioSenior(l.USU_NOMFOR),
    vencimento: dataIso(l.USU_DATVECT),
    sitApr: (l.SITAPR ?? "").trim(),
    sitOcp: (l.SITOCP ?? "").trim(),
    numTit: vazioSenior(l.USU_NUMTIT),
    numNfc: vazioSenior(l.USU_NUMNFC),
    valor: numeroSenior(l.VLRLIQ),
  };
}

export const JANELA_OCS_PADRAO = 2500; // ~ os ultimos 3-4 meses de OCs

async function lerOcsRecentes(janela = JANELA_OCS_PADRAO): Promise<OcAlvo[]> {
  const max = Number((await consultarSenior(`SELECT MAX(NUMOCP) AS MAXOC FROM E420OCP WHERE CODEMP = ${COD_EMP}`))[0]?.MAXOC);
  if (!Number.isInteger(max) || max <= 0) throw new Error("A Senior não devolveu o número da última OC.");
  const linhas = await consultarSenior(`SELECT ${COLUNAS_OC} FROM E420OCP WHERE CODEMP = ${COD_EMP} AND NUMOCP > ${Math.max(0, max - janela)}`);
  return linhas.map(ocDaLinha);
}

async function lerOcsPorNumero(numeros: string[]): Promise<OcAlvo[]> {
  const validos = [...new Set(numeros.filter((n) => /^\d{1,9}$/.test(n)))];
  const achadas: OcAlvo[] = [];
  for (let i = 0; i < validos.length; i += 40) {
    const linhas = await consultarSenior(`SELECT ${COLUNAS_OC} FROM E420OCP WHERE CODEMP = ${COD_EMP} AND NUMOCP IN (${validos.slice(i, i + 40).join(",")})`);
    achadas.push(...linhas.map(ocDaLinha));
  }
  return achadas;
}

async function lerTitulosAbertos(): Promise<TituloAbertoSenior[]> {
  const linhas = await consultarSenior(`SELECT CODFIL, NUMTIT, CODTPT, CODFOR FROM E501TCP WHERE CODEMP = ${COD_EMP} AND SITTIT IN ('AB','PE')`);
  return linhas.map((l) => ({ codFil: l.CODFIL, numTit: (l.NUMTIT ?? "").trim(), codTpt: l.CODTPT, codFor: l.CODFOR })).filter((t) => t.numTit);
}

// ---------------------------------------------------------------- dependencias (injetaveis nos testes)

export type Dependencias = {
  agora: () => Date;
  lerOcs: () => Promise<OcAlvo[]>;
  lerOcsPorNumero: (numeros: string[]) => Promise<OcAlvo[]>;
  lerTitulosAbertos: () => Promise<TituloAbertoSenior[]>;
  vinculosManuais: () => Promise<{ numTit: string; codFil: string; codFor: string; numOcp: string }[]>;
  /** Numeros das OCs que o sistema ja' marca como PAGAS (AprovacaoSenior.pago). */
  ocsPagas: () => Promise<Set<string>>;
  registros: (numeros: string[]) => Promise<RegistroDossie[]>;
  pdfExiste: (caminhoRelativo: string) => Promise<boolean>;
  gravarAssinatura: (chave: string, assinatura: string) => Promise<void>;
  marcarGerando: (codFil: string, numOcp: string) => Promise<unknown>;
  gerar: (oc: { codFil: number; numOcp: number }, extras: { assinatura: string; origem: string }) => Promise<{ ok: boolean; motivo?: string }>;
  /** O servico que converte HTML em PDF responde? (Sem ele, gerar so' enche a lista de erros.) */
  conversorDePdfDisponivel: () => Promise<boolean>;
  /** Nome (E095FOR) de cada codigo de fornecedor, para a lista do que falta. */
  nomesFornecedores: (codigos: string[]) => Promise<Map<string, string>>;
};

const nomesEmMemoria = new Map<string, string>(); // codigo (sem zeros a esquerda) -> nome; fornecedor nao muda de nome a cada ciclo

async function nomesDosFornecedores(codigos: string[]): Promise<Map<string, string>> {
  const faltam = [...new Set(codigos.filter((c) => /^\d+$/.test(c)).map((c) => String(Number(c))))].filter((c) => !nomesEmMemoria.has(c));
  for (let i = 0; i < faltam.length; i += 40) {
    try {
      for (const l of await consultarSenior(`SELECT CODFOR, NOMFOR FROM E095FOR WHERE CODFOR IN (${faltam.slice(i, i + 40).join(",")})`)) {
        if (l.NOMFOR?.trim()) nomesEmMemoria.set(String(Number(l.CODFOR)), l.NOMFOR.trim());
      }
    } catch {
      break; // sem nome nao e' motivo para atrasar o ciclo
    }
  }
  return nomesEmMemoria;
}

export const dependenciasPadrao: Dependencias = {
  agora: () => new Date(),
  lerOcs: () => lerOcsRecentes(Number(process.env.DOSSIE_AUTO_JANELA_OCS) || JANELA_OCS_PADRAO),
  lerOcsPorNumero,
  lerTitulosAbertos,
  vinculosManuais: () => prisma.tituloOcVinculo.findMany({ select: { numTit: true, codFil: true, codFor: true, numOcp: true } }),
  ocsPagas: async () => new Set((await prisma.aprovacaoSenior.findMany({ where: { pago: true }, select: { numOcp: true } })).map((a) => a.numOcp)),
  registros: async (numeros) =>
    (
      await prisma.dossieOC.findMany({
        where: { numOcp: { in: numeros } },
        select: { chave: true, numOcp: true, status: true, motivo: true, assinatura: true, tentativas: true, arquivoPath: true, titulos: true, atualizadoEm: true },
      })
    ).map((r) => r as RegistroDossie),
  pdfExiste: async (caminho) => {
    try {
      await access(path.join(UPLOAD_DIR, caminho));
      return true;
    } catch {
      return false;
    }
  },
  gravarAssinatura: async (chave, assinatura) => {
    await prisma.dossieOC.update({ where: { chave }, data: { assinatura } });
  },
  marcarGerando,
  gerar: (oc, extras) => gerarEGravar(oc, {}, extras),
  nomesFornecedores: nomesDosFornecedores,
  conversorDePdfDisponivel: async () => {
    const base = (process.env.GOTENBERG_URL?.trim() || "http://gotenberg:3000").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8_000) });
      return r.ok;
    } catch {
      return false;
    }
  },
};
export function opcoesPadrao(agora: Date = new Date()): Opcoes {
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return {
    hoje,
    diasAtras: Number(process.env.DOSSIE_AUTO_DIAS_ATRAS) || 30,
    diasAtrasPagas: Number(process.env.DOSSIE_AUTO_DIAS_ATRAS_PAGAS) || 90,
    diasFrente: Number(process.env.DOSSIE_AUTO_DIAS_FRENTE) || 45,
    lote: Number(process.env.DOSSIE_AUTO_LOTE) || 12,
  };
}

// ---------------------------------------------------------------- ciclo

const FALHAS_SEGUIDAS_PARA_PARAR = 3;

export async function executarCiclo(deps: Dependencias = dependenciasPadrao, opcoes: Opcoes = opcoesPadrao(deps.agora()), origem = "agendador"): Promise<ResultadoCiclo> {
  const iniciadoEm = deps.agora();

  // 1) o que a Senior tem agora (uma consulta por vez, na fila unica)
  const [ocsRecentes, abertos, vinculos, pagas] = await Promise.all([deps.lerOcs(), deps.lerTitulosAbertos(), deps.vinculosManuais(), deps.ocsPagas()]);

  const abertosPorFornecedor = new Map<string, TituloAbertoSenior[]>();
  for (const t of abertos) for (const chave of chavesFornecedor(t.codFor)) abertosPorFornecedor.set(chave, [...(abertosPorFornecedor.get(chave) ?? []), t]);
  const abertosDoFornecedor = (codFor: string) => [...new Map(chavesFornecedor(codFor).flatMap((c) => abertosPorFornecedor.get(c) ?? []).map((t) => [`${t.codFil}|${t.codTpt}|${t.numTit}`, t])).values()];
  const estaAberto = (codFor: string, codFil: string, numTit: string) => abertosDoFornecedor(codFor).some((t) => Number(t.codFil) === Number(codFil) && t.numTit === numTit);

  // 2) OCs associadas a mao a um titulo ABERTO que ficaram fora da janela de leitura
  const vinculosAbertos = vinculos.filter((v) => estaAberto(v.codFor, v.codFil, v.numTit));
  const chaveOc = (o: Pick<OcAlvo, "codFil" | "numOcp">) => `${Number(o.codFil)}|${o.numOcp}`;
  const conhecidas = new Set(ocsRecentes.map((o) => o.numOcp));
  const faltantes = [...new Set(vinculosAbertos.map((v) => v.numOcp).filter((n) => !conhecidas.has(n)))];
  const ocs = [...ocsRecentes];
  if (faltantes.length) ocs.push(...(await deps.lerOcsPorNumero(faltantes)));
  const manualPorOc = new Set(vinculosAbertos.map((v) => v.numOcp));

  // 3) quem precisa de dossie
  const { de, ate } = janelaDeVencimento(opcoes.hoje, opcoes.diasAtras, opcoes.diasFrente);
  const dePagas = janelaDeVencimento(opcoes.hoje, Math.max(opcoes.diasAtras, opcoes.diasAtrasPagas), opcoes.diasFrente).de;
  const elegiveis: { oc: OcAlvo; assinatura: string }[] = [];
  const jaVistas = new Set<string>();
  for (const oc of ocs) {
    if (jaVistas.has(chaveOc(oc))) continue;
    jaVistas.add(chaveOc(oc));
    const titulosAbertos = titulosAbertosDaOc(oc, abertosDoFornecedor(oc.codFor));
    const motivo = motivoDeElegibilidade(oc, { temTituloAberto: titulosAbertos.length > 0, temVinculoManual: manualPorOc.has(oc.numOcp), de, ate, paga: pagas.has(oc.numOcp), dePagas });
    if (motivo) elegiveis.push({ oc, assinatura: assinaturaDaOc(oc, titulosAbertos) });
  }

  // 4) o que cada uma ja tem
  const registros = elegiveis.length ? await deps.registros(elegiveis.map((e) => e.oc.numOcp)) : [];
  const registroPorChave = new Map(registros.map((r) => [r.chave, r]));
  const agora = deps.agora();
  const decididos = await Promise.all(
    elegiveis.map(async ({ oc, assinatura }) => {
      const registro = registroPorChave.get(chaveDaOc(oc.codFil, oc.numOcp)) ?? null;
      const pdfExiste = registro?.arquivoPath ? await deps.pdfExiste(registro.arquivoPath) : false;
      return { oc, assinatura, registro, decisao: decidir(oc, assinatura, registro, pdfExiste, agora) };
    })
  );

  // 5) dossie ja bom e sem assinatura: so' registra o estado de hoje (nao refaz o PDF)
  let adotados = 0;
  for (const d of decididos) {
    if (d.decisao.acao !== "ADOTAR" || !d.registro) continue;
    await deps.gravarAssinatura(d.registro.chave, d.assinatura);
    adotados++;
  }

  // 6) gera o que falta, o mais proximo de vencer primeiro
  const aGerar = decididos
    .filter((d) => d.decisao.acao === "GERAR")
    .sort((a, b) => a.decisao.prioridade - b.decisao.prioridade || distancia(a.oc.vencimento, opcoes.hoje) - distancia(b.oc.vencimento, opcoes.hoje) || Number(b.oc.numOcp) - Number(a.oc.numOcp));
  let geradosAgora = 0;
  let falhasAgora = 0;
  let interrompidoPor: string | null = null;
  const tratadas = new Set<string>();
  const falhouAgora = new Map<string, string>(); // chave da OC -> motivo da falha nesta verificacao

  if (aGerar.length > 0) {
    if (!(await deps.conversorDePdfDisponivel())) {
      interrompidoPor = "O serviço que converte o dossiê em PDF (Gotenberg) não respondeu; nada foi gerado neste ciclo.";
    } else {
      let falhasSeguidas = 0;
      for (const d of aGerar.slice(0, opcoes.lote)) {
        await deps.marcarGerando(d.oc.codFil, d.oc.numOcp);
        const r = await deps.gerar({ codFil: Number(d.oc.codFil), numOcp: Number(d.oc.numOcp) }, { assinatura: d.assinatura, origem: "APPCNS_AUTO" });
        tratadas.add(chaveOc(d.oc));
        if (r.ok) {
          geradosAgora++;
          falhasSeguidas = 0;
        } else {
          falhasAgora++;
          falhouAgora.set(chaveOc(d.oc), r.motivo ?? "sem motivo registrado");
          if (++falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
            interrompidoPor = `${FALHAS_SEGUIDAS_PARA_PARAR} falhas seguidas (última: ${r.motivo ?? "sem motivo"}); o ciclo parou para não insistir.`;
            break;
          }
        }
      }
    }
  }

  // 7) foto da cobertura
  const pendentes: ItemDoCiclo[] = decididos
    .filter((d) => d.decisao.acao === "GERAR" || d.decisao.acao === "AGUARDAR")
    .filter((d) => !tratadas.has(chaveOc(d.oc)) || falhouAgora.has(chaveOc(d.oc))) // gerada agora = em dia; falhou agora = segue pendente
    .sort((a, b) => a.decisao.prioridade - b.decisao.prioridade || distancia(a.oc.vencimento, opcoes.hoje) - distancia(b.oc.vencimento, opcoes.hoje))
    .map((d) => {
      const falha = falhouAgora.get(chaveOc(d.oc));
      const base = { numOcp: d.oc.numOcp, codFil: d.oc.codFil, codFor: d.oc.codFor, fornecedorNome: d.oc.fornecedorNome, vencimento: d.oc.vencimento };
      return falha !== undefined
        ? { ...base, situacao: "ERRO" as Situacao, acao: "AGUARDAR" as Acao, motivo: `falhou agora e será repetida: ${falha}` }
        : { ...base, situacao: d.decisao.situacao, acao: d.decisao.acao, motivo: d.decisao.motivo };
    });
  const contar = (s: Situacao) => pendentes.filter((p) => p.situacao === s).length;
  // Nome do fornecedor so' do que a tela vai mostrar (a OC nem sempre traz USU_NOMFOR); falha ao buscar = fica sem nome.
  const mostrados = pendentes.slice(0, 300);
  const nomes = await deps.nomesFornecedores(mostrados.filter((p) => !p.fornecedorNome).map((p) => p.codFor)).catch(() => new Map<string, string>());
  for (const p of mostrados) p.fornecedorNome ??= nomes.get(String(Number(p.codFor))) ?? null;
  const resultado: ResultadoCiclo = {
    iniciadoEm: iniciadoEm.toISOString(),
    terminouEm: deps.agora().toISOString(),
    origem,
    elegiveis: elegiveis.length,
    atuais: decididos.filter((d) => d.decisao.acao === "OK" || d.decisao.acao === "ADOTAR").length + geradosAgora,
    adotados,
    semDossie: contar("SEM_DOSSIE"),
    desatualizados: contar("DESATUALIZADO"),
    comErro: contar("ERRO"),
    gerando: contar("GERANDO"),
    geradosAgora,
    falhasAgora,
    interrompidoPor,
    pendentes: mostrados,
  };
  return resultado;
}

// ---------------------------------------------------------------- estado em memoria + disparo

type Estado = { emCurso: boolean; ultimo: ResultadoCiclo | null; ultimoErro: { em: string; mensagem: string } | null; iniciadoEm: string | null };
const g = globalThis as unknown as { __estadoDossieAuto?: Estado };
const estado: Estado = (g.__estadoDossieAuto ??= { emCurso: false, ultimo: null, ultimoErro: null, iniciadoEm: null });

export function estadoAutomatico() {
  return {
    ativo: process.env.DOSSIE_AUTO !== "0",
    emCurso: estado.emCurso,
    iniciadoEm: estado.iniciadoEm,
    ultimo: estado.ultimo,
    ultimoErro: estado.ultimoErro,
  };
}

/** Roda um ciclo em segundo plano. Dois ao mesmo tempo nunca: se ja ha um em curso, nao inicia outro. */
export function dispararCiclo(origem: string, deps: Dependencias = dependenciasPadrao): { iniciado: boolean } {
  if (estado.emCurso) return { iniciado: false };
  estado.emCurso = true;
  estado.iniciadoEm = new Date().toISOString();
  void (async () => {
    try {
      const r = await executarCiclo(deps, opcoesPadrao(deps.agora()), origem);
      estado.ultimo = r;
      estado.ultimoErro = null;
      console.info(
        `[dossie-auto] ${origem}: ${r.elegiveis} elegíveis, ${r.atuais} em dia, gerados ${r.geradosAgora}, falhas ${r.falhasAgora}, faltam ${r.semDossie + r.desatualizados + r.comErro + r.gerando}${r.interrompidoPor ? ` — ${r.interrompidoPor}` : ""}`
      );
    } catch (e) {
      const mensagem = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      estado.ultimoErro = { em: new Date().toISOString(), mensagem };
      console.error(`[dossie-auto] ${origem}: ciclo falhou — ${mensagem}`);
    } finally {
      estado.emCurso = false;
    }
  })();
  return { iniciado: true };
}
