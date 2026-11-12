// Ordens de compra da Senior (E420OCP + alcada) -> AprovacaoSenior (12/11/2026).
//
// Porte fiel do sincronizar_aprovacoes_senior.py que rodava no VPS via n8n: mesmas consultas, mesmas regras de nivel/alcada,
// mesmo formato gravado. A gravacao (processarAprovacoes) e' a que estava na rota POST /api/senior/aprovacoes/sync, que
// continua aceitando o envio externo. Diferencas de proposito:
//  - consulta que falha (depois de novas tentativas) interrompe a busca: o script gravava OC sem rateio/nivel quando um lote
//    falhava, e a tela mostrava "aguardando" para o que ja estava aprovado;
//  - nome da conta financeira vem da Senior (E091PLF, como no dossie), nao mais do banco do VPS;
//  - quem esta desligado vem da folha (HCM) quando a credencial dela existe (ver pessoasAtivas.ts).

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { LinhaSenior } from "../getDbInfo";
import type { AoProgredir, Consultar } from "./titulos";
import type { UsuarioSync } from "./usuarios";

// ---------------------------------------------------------------- gravacao (antes dentro da rota de entrada)

export const itemOcSchema = z.object({
  numOcp: z.string(),
  codFil: z.string().optional().nullable(),
  dataEmissao: z.string(), // ISO
  fornecedorCodigo: z.string(),
  fornecedorNome: z.string().optional().nullable(),
  valor: z.number(),
  descricao: z.string().optional().nullable(),
  contratoTexto: z.string().optional().nullable(),
  codccu: z.string().optional().nullable(),
  contratoNome: z.string().optional().nullable(),
  numApr: z.string(),
  rotNap: z.string().optional().nullable(),
  situacaoAtual: z.string(),
  niveisExigidos: z.string().optional().nullable(),
  niveisAprovados: z.string().optional().nullable(),
  nivelAtual: z.number().int().default(1),
  historicoNiveis: z.string().optional().nullable(),
  temRateio: z.boolean().default(false),
  rateioDetalhe: z.string().optional().nullable(),
  mapaCotacao: z.string().optional().nullable(),
  proximoAprovadorCod: z.string().optional().nullable(),
  aprovadoresPendentes: z.string().optional().nullable(),
  aprovadoresPendentesCod: z.string().optional().nullable(),
  criadorCod: z.string().optional().nullable(),
  previsaoPagamento: z.string().optional().nullable(),
  pago: z.boolean().optional().default(false),
  usuNumTit: z.string().optional().nullable(),
  usuNumNfc: z.string().optional().nullable(),
});

export type ItemOc = z.input<typeof itemOcSchema>;
type ItemOcLido = z.infer<typeof itemOcSchema>;

const SITUACOES_PENDENTES = new Set(["ANA", "PRE"]);
const SITUACOES_RESOLVIDAS = new Set(["APR", "REP", "CAN"]);

/**
 * Efeitos: (1) upsert em AprovacaoSenior por numOcp (campos descritivos sempre reescritos); (2) toda mudanca de situacaoAtual
 * vira 1 linha em AprovacaoSeniorEvento; (3) OC nova e pendente -> Notification para os aprovadores; (4) OC que estava
 * pendente e virou APR/REP/CAN -> resolvidoEm/resolvidoComo. Proximo aprovador e criador resolvidos pelo de-para UsuarioSenior.
 */
export async function processarAprovacoes(entrada: ItemOc[]) {
  const itens: ItemOcLido[] = entrada.map((i) => itemOcSchema.parse(i));
  const aprovadores = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ role: { in: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"] } }, { nivelHierarquico: { in: ["DIRETORIA", "GERENCIA", "COORDENACAO"] } }],
    },
    select: { id: true },
  });

  const codsUsados = Array.from(
    new Set(
      itens
        .flatMap((i) => [i.proximoAprovadorCod, i.criadorCod, ...(i.aprovadoresPendentesCod?.split(",") ?? [])])
        .map((c) => c?.trim())
        .filter((c): c is string => !!c)
    )
  );
  const usuariosSenior = codsUsados.length
    ? await prisma.usuarioSenior.findMany({ where: { codigo: { in: codsUsados } }, include: { user: { select: { name: true } } } })
    : [];
  const deParaSenior = new Map(usuariosSenior.map((u) => [u.codigo, u]));

  const nomeSenior = (cod: string | null | undefined) => {
    if (!cod) return null;
    const u = deParaSenior.get(cod);
    return u?.user?.name ?? u?.nome ?? null;
  };
  const resolverProximo = (cod: string | null | undefined) => {
    if (!cod) return { proximoAprovadorCod: null, proximoAprovadorNome: null, proximoAprovadorUserId: null };
    const u = deParaSenior.get(cod);
    return { proximoAprovadorCod: cod, proximoAprovadorNome: u?.nome ?? null, proximoAprovadorUserId: u?.userId ?? null };
  };
  // userIds do sistema para os codigos Senior de quem falta aprovar (todos os niveis pendentes de todas as linhas de rateio)
  const userIdsPendentes = (codsCsv: string | null | undefined): string[] => {
    if (!codsCsv) return [];
    const ids = new Set<string>();
    for (const cod of codsCsv.split(",").map((c) => c.trim()).filter(Boolean)) {
      const uid = deParaSenior.get(cod)?.userId;
      if (uid) ids.add(uid);
    }
    return [...ids];
  };

  let novas = 0;
  let atualizadas = 0;
  let resolvidas = 0;
  let notificacoesCriadas = 0;

  for (const item of itens) {
    const existente = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: item.numOcp } });
    const prox = resolverProximo(item.proximoAprovadorCod);

    // campos descritivos -- reescritos a cada sync (dado do Senior manda)
    const descritivos = {
      fornecedorCodigo: item.fornecedorCodigo,
      codFil: item.codFil || existente?.codFil || null,
      fornecedorNome: item.fornecedorNome || null,
      valor: item.valor,
      descricao: item.descricao || null,
      contratoTexto: item.contratoTexto || null,
      codccu: item.codccu || existente?.codccu || null,
      contratoNome: item.contratoNome || null,
      criadorCod: item.criadorCod || null,
      criadorNome: nomeSenior(item.criadorCod),
      previsaoPagamento: item.previsaoPagamento ? new Date(item.previsaoPagamento) : null,
      pago: item.pago ?? false,
      rotNap: item.rotNap || null,
      niveisExigidos: item.niveisExigidos || null,
      niveisAprovados: item.niveisAprovados || null,
      historicoNiveis: item.historicoNiveis || null,
      temRateio: item.temRateio,
      rateioDetalhe: item.rateioDetalhe || null,
      mapaCotacao: item.mapaCotacao || null,
      nivelAtual: item.nivelAtual,
      aprovadoresPendentes: item.aprovadoresPendentes || null,
      aprovadoresPendentesCod: item.aprovadoresPendentesCod || null,
      ...prox,
    };

    if (!existente) {
      const criada = await prisma.aprovacaoSenior.create({
        data: {
          numOcp: item.numOcp,
          dataEmissao: new Date(item.dataEmissao),
          numApr: item.numApr,
          situacaoAtual: item.situacaoAtual,
          usuNumTit: item.usuNumTit || null,
          usuNumNfc: item.usuNumNfc || null,
          ...descritivos,
          ...(SITUACOES_RESOLVIDAS.has(item.situacaoAtual) ? { resolvidoEm: new Date(), resolvidoComo: item.situacaoAtual } : {}),
        },
      });
      await prisma.aprovacaoSeniorEvento.create({
        data: { aprovacaoSeniorId: criada.id, situacao: item.situacaoAtual, nivel: item.nivelAtual, observacao: "Deteccao inicial" },
      });
      novas++;

      if (SITUACOES_PENDENTES.has(item.situacaoAtual)) {
        const valorFmt = item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        // notifica quem a alcada aponta como pendente; se nao casou ninguem, o grupo
        const idsPendentes = userIdsPendentes(item.aprovadoresPendentesCod);
        const destinatarios = idsPendentes.length
          ? idsPendentes.map((id) => ({ id }))
          : prox.proximoAprovadorUserId
            ? [{ id: prox.proximoAprovadorUserId }]
            : aprovadores;
        await prisma.notification.createMany({
          data: destinatarios.map((a) => ({
            userId: a.id,
            type: "APROVACAO_PENDENTE" as const,
            title: `OC ${item.numOcp} aguardando aprovação (${valorFmt})`,
            body: item.descricao?.slice(0, 200) || null,
            link: "/aprovacoes/senior",
          })),
        });
        notificacoesCriadas += destinatarios.length;
      }
      continue;
    }

    const mudouSituacao = existente.situacaoAtual !== item.situacaoAtual;
    const foiResolvidaAgora = mudouSituacao && SITUACOES_PENDENTES.has(existente.situacaoAtual) && SITUACOES_RESOLVIDAS.has(item.situacaoAtual);

    if (mudouSituacao) {
      await prisma.aprovacaoSeniorEvento.create({
        data: {
          aprovacaoSeniorId: existente.id,
          situacao: item.situacaoAtual,
          nivel: item.nivelAtual,
          observacao: `Mudou de ${existente.situacaoAtual} para ${item.situacaoAtual}`,
        },
      });
      if (foiResolvidaAgora) resolvidas++;
      else atualizadas++;
    }

    await prisma.aprovacaoSenior.update({
      where: { id: existente.id },
      data: {
        situacaoAtual: item.situacaoAtual,
        ...descritivos,
        // 30/09/2026: usuNumTit/usuNumNfc so' atualizam quando a Senior manda algo preenchido -- uma correcao manual que so'
        // existe aqui (OC 15115/15631, em branco na Senior) nao pode ser apagada a cada sincronizacao.
        ...(item.usuNumTit ? { usuNumTit: item.usuNumTit } : {}),
        ...(item.usuNumNfc ? { usuNumNfc: item.usuNumNfc } : {}),
        ...(foiResolvidaAgora ? { resolvidoEm: new Date(), resolvidoComo: item.situacaoAtual } : {}),
      },
    });
  }

  return { novas, atualizadas, resolvidas, notificacoesCriadas, totalRecebido: itens.length };
}

/** OCs que o sistema acompanha e que a busca repuxa sempre: pendentes + resolvidas nos ultimos 30 dias. */
export async function ocsAcompanhadas(): Promise<string[]> {
  const trintaDiasAtras = new Date(Date.now() - 30 * 86400000);
  const linhas = await prisma.aprovacaoSenior.findMany({
    where: { OR: [{ situacaoAtual: { in: ["ANA", "PRE"] } }, { resolvidoEm: { gte: trintaDiasAtras } }] },
    select: { numOcp: true },
  });
  return [...new Set(linhas.map((l) => l.numOcp))];
}

// ---------------------------------------------------------------- leitura na Senior (porte do sincronizar_aprovacoes_senior.py)

export const JANELA_DIAS = 42;
const ROTA_OC = "12"; // ROTNAP da rota de aprovacao de Ordem de Compra
const GRUPO_NIVEL: Record<number, string> = { 1: "Coordenação", 2: "Gerência", 3: "Diretoria" };
// Login errado no proprio Senior para este CODUSU (11/09/2026: e' RICARDO LUIS DE ALMEIDA, nao reinaldo.almeida).
const NOME_CORRIGIDO: Record<string, string> = { "107": "ricardo.almeida" };
const CAMPOS_OC = "NUMOCP, DATEMI, CODFOR, USU_NOMFOR, VLRLIQ, VLRORI, VLRFIN, SITAPR, NUMAPR, ROTNAP, USUGER, USU_DATVECT, OBSOCP, USU_NUMTIT, USU_NUMNFC";
// Oracle recusa mais de 1000 expressoes num IN (ORA-01795).
const MAX_IN = 900;

// "C/C: ADM MARKETING" / "CC: MRN 3748" / "C/C MRN CT 4343/2026."
const PADRAO_CC = /\bC\/?C\s*[:\-]?\s*([A-Z0-9À-Ú][A-Z0-9À-Ú&. \/\-]{3,70}?)\s*(?:[.;]|$|\bEM\b|\bPERIODO\b|\bREF\b)/i;

export function extrairCcTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = PADRAO_CC.exec(texto);
  if (!m) return null;
  const v = m[1].replace(/\s+/g, " ").replace(/^[ .:\-]+|[ .:\-]+$/g, "");
  return v || null;
}

/** "dd/mm/aaaa" -> "aaaa-mm-ddT00:00:00" (como o datetime.isoformat() do script); invalido -> null. */
export function dataIsoOc(br: string | null | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((br ?? "").trim());
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, mes - 1, d));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`;
}

export function numeroOc(v: string | null | undefined): number {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const limpo = (v: string | null | undefined) => (v ?? "").trim() || null;
const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;

/** NIVEXI -> {nivel: assinaturas exigidas}. "(1)*(2)*(3)" -> {1:1,2:1,3:1}; "(1*1)" -> {1:2}; vazio -> {1:1}. */
export function slotsDeNivexi(nivexi: string | null | undefined): Map<number, number> {
  const slots = new Map<number, number>();
  for (const x of String(nivexi ?? "").match(/\d+/g) ?? []) slots.set(Number(x), (slots.get(Number(x)) ?? 0) + 1);
  return slots.size ? slots : new Map([[1, 1]]);
}

const lotes = <T>(itens: T[], tamanho: number) => Array.from({ length: Math.ceil(itens.length / tamanho) }, (_, i) => itens.slice(i * tamanho, (i + 1) * tamanho));

async function emLotesIn(consultar: Consultar, valores: string[], sql: (lista: string) => string, timeoutMs: number) {
  const linhas: LinhaSenior[] = [];
  for (const lote of lotes(valores, MAX_IN)) linhas.push(...(await consultar(sql(lote.join(",")), { timeoutMs })));
  return linhas;
}

/** CODUSU -> {login, email} do E099USU, com a correcao de cadastro conhecida. */
export function usuariosDoE099(linhas: LinhaSenior[]): Map<string, { login: string; email: string }> {
  const m = new Map<string, { login: string; email: string }>();
  for (const r of linhas) {
    const cod = (r.CODUSU ?? "").trim();
    if (!cod || cod === "0") continue;
    const login = (r.NOMUSU ?? "").trim();
    const email = (r.INTNET ?? "").trim();
    const atual = m.get(cod);
    if (!atual || (!atual.email && email)) m.set(cod, { login, email });
  }
  for (const [cod, login] of Object.entries(NOME_CORRIGIDO)) if (m.has(cod)) m.get(cod)!.login = login;
  return m;
}

type Assinatura = { usu: string; data: string };
type Aprovacoes = { porCcNiv: Map<string, Assinatura>; globalNiv: Map<number, Assinatura>; linhas: LinhaSenior[] };

export type DadosOcs = {
  ocs: LinhaSenior[]; // E420OCP ja filtradas (janela + acompanhadas + pendentes)
  loginDe: Map<string, string>;
  nomesCcu: Map<string, string>;
  nomesConta: Map<string, string>;
  rateios: Map<string, { seq: number; codccu: string; ctafin: string; perc: number; valor: number }[]>;
  exigidos: Map<string, { slots: Map<number, number>; sitaprRota: string }>;
  aprovacoes: Map<string, Aprovacoes>;
  alcada: Map<string, Map<number, string[]>>;
  fornecedores: Map<string, string>;
};

/**
 * Monta o item de cada OC exatamente como o script montava: niveis exigidos (E614APR.NIVEXI), assinaturas (E614USU por centro
 * de custo, com o nivel "compartilhado" quando a exigencia e' menor que o numero de centros do rateio), alcada (E068CNA) e quem
 * falta aprovar. `ativo(login)` diz se a pessoa ainda trabalha aqui (folha); desligado so' aparece, marcado, se ninguem do nivel
 * estiver ativo.
 */
export function montarItensOc(d: DadosOcs, ativo: (login: string) => boolean): ItemOc[] {
  const ativoCod = (cod: string) => {
    const login = d.loginDe.get(cod);
    return login ? ativo(login) : true;
  };
  const soAtivos = (cods: string[]) => {
    const a = cods.filter(ativoCod);
    return a.length ? a : cods;
  };
  const nomesMarcados = (cods: string[]) =>
    soAtivos(cods).map((c) => {
      const nome = d.loginDe.get(c) || `#${c}`;
      return ativoCod(c) ? nome : `${nome} (desligado)`;
    });
  const nomeUsu = (cod: string) => d.loginDe.get(cod) || (cod ? `#${cod}` : null);

  const itens: ItemOc[] = [];
  for (const o of d.ocs) {
    const numOcp = String(o.NUMOCP);
    const numApr = String(o.NUMAPR ?? "").trim();
    const rt = d.rateios.get(numOcp) ?? [];
    const info = d.exigidos.get(numApr);
    const slots = info?.slots?.size ? info.slots : new Map([[1, 1]]);
    const exigidos = [...slots.keys()].sort((a, b) => a - b);
    const sitaprRota = info?.sitaprRota ?? "";
    // SITAPR da rota (E614APR) manda quando e' terminal; o cabecalho da OC pode ficar ANA para sempre (OC 3184, 14/09/2026).
    const situacaoFinal = ["APR", "REP", "CAN"].includes(sitaprRota) ? sitaprRota : o.SITAPR;
    const apv: Aprovacoes = d.aprovacoes.get(numApr) ?? { porCcNiv: new Map(), globalNiv: new Map(), linhas: [] };

    const linhasCc: (string | null)[] = rt.length ? rt.map((l) => l.codccu) : [null];
    const assinaturasNoNivel = (n: number) => {
      const vistas = [...apv.porCcNiv.entries()].filter(([k]) => Number(k.split("|")[1]) === n).map(([, v]) => v);
      if (apv.globalNiv.has(n)) vistas.push(apv.globalNiv.get(n)!);
      return vistas;
    };
    // NIVEXI conta as assinaturas da OC INTEIRA no nivel, nao por centro: com menos exigencias que centros, uma assinatura em
    // qualquer centro cobre todos (OC 3184); com tantas quanto centros, e' uma por centro (OC 15354).
    const assinatura = (cc: string | null, n: number): Assinatura | null => {
      const direta = (cc !== null ? apv.porCcNiv.get(`${cc}|${n}`) : undefined) ?? apv.globalNiv.get(n);
      if (direta) return direta;
      const exigido = slots.get(n) ?? 1;
      if (exigido < linhasCc.length) {
        const vistas = assinaturasNoNivel(n);
        if (vistas.length >= exigido && vistas.length) return vistas[0];
      }
      return null;
    };

    const pendente = new Map(exigidos.map((n) => [n, linhasCc.some((cc) => assinatura(cc, n) === null)]));
    const niveisAprovados = exigidos.filter((n) => !pendente.get(n));
    const niveisPendentes = exigidos.filter((n) => pendente.get(n));
    const nivelAtual = niveisPendentes[0] ?? exigidos[exigidos.length - 1] ?? 1;

    const rateioDetalhe = rt.map((l) => {
      const porNivel = d.alcada.get(l.codccu) ?? new Map<number, string[]>();
      return {
        seq: l.seq,
        codccu: l.codccu,
        ccuNome: d.nomesCcu.get(l.codccu) ?? "",
        contaFinanceira: l.ctafin ? d.nomesConta.get(l.ctafin) ?? `conta ${l.ctafin}` : "",
        perc: arred(l.perc, 4),
        valor: arred(l.valor, 2),
        niveis: exigidos.map((n) => {
          const cods = porNivel.get(n) ?? [];
          const sig = assinatura(l.codccu, n);
          const base: Record<string, unknown> = {
            nivel: n,
            grupo: GRUPO_NIVEL[n] ?? `Nível ${n}`,
            aprovadoresCod: soAtivos(cods),
            aprovadores: nomesMarcados(cods),
          };
          if (sig) Object.assign(base, { status: "aprovado", aprovadoPorCod: sig.usu, aprovadoPor: nomeUsu(sig.usu), aprovadoEm: sig.data });
          else base.status = "pendente";
          return base;
        }),
      };
    });

    const ccusRateio = [...new Set(rt.map((l) => l.codccu).filter(Boolean))].sort();
    const temRateio = rt.length > 1 || ccusRateio.length > 1;
    const codccu = ccusRateio.length === 1 ? ccusRateio[0] : null;

    // quem falta assinar o nivel ATUAL, nas linhas (centros) onde ele ainda esta pendente
    let pendCod: string[] = [];
    for (const cc of linhasCc) {
      if (assinatura(cc, nivelAtual) !== null) continue;
      for (const c of (cc !== null ? d.alcada.get(cc)?.get(nivelAtual) : undefined) ?? []) if (!pendCod.includes(c)) pendCod.push(c);
    }
    pendCod = soAtivos(pendCod);
    const pendNomes = nomesMarcados(pendCod);

    const historico = apv.linhas.map((r) => ({ SEQAPR: r.SEQAPR, NIVAPR: r.NIVAPR, USUAPR: r.USUAPR, SITAPR: r.SITAPR, CCUAPR: r.CCUAPR, DATAPR: r.DATAPR }));

    itens.push({
      numOcp,
      dataEmissao: dataIsoOc(o.DATEMI) ?? new Date().toISOString(),
      fornecedorCodigo: String(o.CODFOR),
      fornecedorNome: limpo(o.USU_NOMFOR) || d.fornecedores.get(String(o.CODFOR).trim()) || null,
      // 30/09/2026: nenhum dos tres campos de valor e' confiavel sozinho (OC 15115 so' VLRORI, OC 15631 so' VLRLIQ).
      valor: numeroOc(o.VLRLIQ) || numeroOc(o.VLRORI) || numeroOc(o.VLRFIN),
      descricao: (o.OBSOCP ?? "").trim() || null,
      contratoTexto: extrairCcTexto(o.OBSOCP),
      codccu,
      contratoNome: codccu ? d.nomesCcu.get(codccu) ?? null : null,
      criadorCod: limpo(o.USUGER),
      previsaoPagamento: dataIsoOc(o.USU_DATVECT),
      usuNumTit: limpo(o.USU_NUMTIT),
      usuNumNfc: limpo(o.USU_NUMNFC),
      pago: false, // OC pendente de aprovacao nunca esta paga
      numApr,
      rotNap: String(o.ROTNAP ?? ""),
      situacaoAtual: situacaoFinal,
      niveisExigidos: exigidos.join(","),
      niveisAprovados: niveisAprovados.join(","),
      nivelAtual,
      historicoNiveis: JSON.stringify(historico),
      temRateio,
      rateioDetalhe: rateioDetalhe.length ? JSON.stringify(rateioDetalhe) : null,
      mapaCotacao: null,
      aprovadoresPendentes: pendNomes.join(", ") || null,
      aprovadoresPendentesCod: pendCod.join(",") || null,
      proximoAprovadorCod: pendCod.length === 1 ? pendCod[0] : null,
    });
  }
  return itens;
}

/** Le na Senior tudo que a montagem das OCs precisa. `acompanhadas`: OCs que o sistema ja segue (pendentes + resolvidas). */
export async function lerOcsDaSenior(
  consultar: Consultar,
  acompanhadas: string[],
  aoProgredir: AoProgredir = () => {},
  agora = new Date()
): Promise<{ dados: DadosOcs; usuarios: UsuarioSync[] }> {
  aoProgredir("lendo usuários da Senior");
  const usu = usuariosDoE099(await consultar("SELECT DISTINCT CODUSU, NOMUSU, INTNET FROM E099USU", { timeoutMs: 120_000 }));
  const usuarios: UsuarioSync[] = [...usu.entries()].map(([codigo, v]) => ({ codigo, nome: v.login || `codigo ${codigo}`, login: v.login || null, email: v.email || null }));
  const loginDe = new Map([...usu.entries()].map(([c, v]) => [c, v.login] as const));

  aoProgredir("lendo centros de custo e contas");
  const nomesCcu = new Map((await consultar("SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP=1", { timeoutMs: 120_000 })).map((r) => [(r.CODCCU ?? "").trim(), (r.DESCCU ?? "").trim()] as const));
  const nomesConta = new Map((await consultar("SELECT CTAFIN, DESCTA FROM E091PLF WHERE CODEMP = 1", { timeoutMs: 120_000 })).map((r) => [(r.CTAFIN ?? "").trim(), (r.DESCTA ?? "").trim()] as const));

  aoProgredir("lendo ordens de compra");
  // 30/09/2026: so' ANA/PRE deixava invisivel a OC aprovada rapido. Alem delas, sempre uma faixa de 1500 numeros (~90 dias):
  // o GetDBInfo nao filtra por data.
  const max = await consultar("SELECT MAX(NUMOCP) MX FROM E420OCP", { timeoutMs: 60_000 });
  const limite = max[0]?.MX ? Number(max[0].MX) - 1500 : 0;
  const ocps = await consultar(`SELECT ${CAMPOS_OC} FROM E420OCP WHERE (SITAPR IN ('ANA','PRE')) OR (NUMOCP > ${limite})`, { timeoutMs: 180_000 });
  const vistos = new Set(ocps.map((o) => String(o.NUMOCP)));
  const acompanhadasNumericas = acompanhadas.filter((n) => /^\d+$/.test(n));
  for (const o of await emLotesIn(consultar, acompanhadasNumericas, (l) => `SELECT ${CAMPOS_OC} FROM E420OCP WHERE NUMOCP IN (${l})`, 120_000)) {
    if (!vistos.has(String(o.NUMOCP))) {
      ocps.push(o);
      vistos.add(String(o.NUMOCP));
    }
  }

  const corte = agora.getTime() - JANELA_DIAS * 86400000;
  const requery = new Set(acompanhadas);
  // 23/10/2026: toda OC pendente entra, mesmo emitida ha mais de JANELA_DIAS (senao a OC antiga parada nunca aparece).
  const ocs = ocps.filter((o) => {
    const d = dataIsoOc(o.DATEMI);
    const naJanela = !!d && new Date(d).getTime() >= corte;
    return naJanela || requery.has(String(o.NUMOCP)) || ["ANA", "PRE"].includes((o.SITAPR ?? "").trim().toUpperCase());
  });

  aoProgredir("lendo rateios e níveis de aprovação");
  const numocps = ocs.map((o) => String(o.NUMOCP));
  const numaprs = [...new Set(ocs.map((o) => String(o.NUMAPR ?? "").trim()).filter((n) => n && n !== "0"))].sort();

  const rateios = new Map<string, { seq: number; codccu: string; ctafin: string; perc: number; valor: number }[]>();
  for (const r of await emLotesIn(consultar, numocps, (l) => `SELECT NUMOCP, SEQRAT, CTAFIN, CODCCU, PERRAT, VLRRAT FROM E420RAT WHERE NUMOCP IN (${l})`, 120_000)) {
    const oc = String(r.NUMOCP).trim();
    rateios.set(oc, [...(rateios.get(oc) ?? []), { seq: Math.trunc(numeroOc(r.SEQRAT)), codccu: (r.CODCCU ?? "").trim(), ctafin: (r.CTAFIN ?? "").trim(), perc: numeroOc(r.PERRAT), valor: numeroOc(r.VLRRAT) }]);
  }
  for (const l of rateios.values()) l.sort((a, b) => a.seq - b.seq);

  const exigidos = new Map<string, { slots: Map<number, number>; sitaprRota: string }>();
  for (const r of await emLotesIn(consultar, numaprs, (l) => `SELECT NUMAPR, NIVEXI, SITAPR FROM E614APR WHERE NUMAPR IN (${l}) AND ROTNAP=${ROTA_OC}`, 120_000)) {
    exigidos.set(String(r.NUMAPR).trim(), { slots: slotsDeNivexi(r.NIVEXI), sitaprRota: (r.SITAPR ?? "").trim().toUpperCase() });
  }

  // So' a rota de OC (ROTNAP=12): a mesma NUMAPR tem linhas da rota de empenho/orcamento (ROTNAP=3) que nao contam aqui.
  const aprovacoes = new Map<string, Aprovacoes>();
  for (const r of await emLotesIn(
    consultar,
    numaprs,
    (l) => `SELECT NUMAPR, SEQAPR, NIVAPR, USUAPR, SITAPR, CCUAPR, DATAPR FROM E614USU WHERE NUMAPR IN (${l}) AND ROTNAP=${ROTA_OC}`,
    90_000
  )) {
    const na = String(r.NUMAPR).trim();
    const a: Aprovacoes = aprovacoes.get(na) ?? { porCcNiv: new Map(), globalNiv: new Map(), linhas: [] };
    aprovacoes.set(na, a);
    a.linhas.push(r);
    if ((r.SITAPR ?? "").trim().toUpperCase() !== "APR") continue;
    const n = String(r.NIVAPR ?? "").trim();
    if (!/^\d+$/.test(n)) continue;
    const cc = (r.CCUAPR ?? "").trim();
    const info = { usu: (r.USUAPR ?? "").trim(), data: (r.DATAPR ?? "").trim() };
    if (cc && cc !== "0") a.porCcNiv.set(`${cc}|${Number(n)}`, info);
    else a.globalNiv.set(Number(n), info);
  }

  const ccsRateio = [...new Set([...rateios.values()].flat().map((l) => l.codccu).filter(Boolean))].sort();
  const alcada = new Map<string, Map<number, string[]>>();
  for (const r of await emLotesIn(
    consultar,
    ccsRateio.map((c) => `'${c.replace(/'/g, "")}'`),
    (l) => `SELECT CODCCU, CODNAP, CODUSU, SITCNA FROM E068CNA WHERE CODCCU IN (${l}) AND ROTNAP=${ROTA_OC}`,
    180_000
  )) {
    if ((r.SITCNA ?? "").trim().toUpperCase() !== "A") continue;
    const cc = (r.CODCCU ?? "").trim();
    const niv = String(r.CODNAP ?? "").trim();
    const cod = (r.CODUSU ?? "").trim();
    if (!cc || !/^\d+$/.test(niv) || !cod || cod === "0") continue;
    const porNivel = alcada.get(cc) ?? new Map<number, string[]>();
    alcada.set(cc, porNivel);
    const lista = porNivel.get(Number(niv)) ?? [];
    porNivel.set(Number(niv), lista);
    if (!lista.includes(cod)) lista.push(cod);
  }

  aoProgredir("lendo fornecedores das OCs");
  const codfors = [...new Set(ocs.map((o) => String(o.CODFOR ?? "").trim()).filter((c) => c && c !== "0" && /^\d+$/.test(c)))].sort();
  const fornecedores = new Map<string, string>();
  for (const r of await emLotesIn(consultar, codfors, (l) => `SELECT CODFOR, NOMFOR, APEFOR FROM E095FOR WHERE CODFOR IN (${l})`, 90_000)) {
    fornecedores.set(String(r.CODFOR ?? "").trim(), (r.NOMFOR ?? "").trim() || (r.APEFOR ?? "").trim());
  }

  return { dados: { ocs, loginDe, nomesCcu, nomesConta, rateios, exigidos, aprovacoes, alcada, fornecedores }, usuarios };
}
