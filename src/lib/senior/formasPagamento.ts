// Forma de pagamento da Senior nas abas Programacao de Pagamento e Conferencia
// de OC: codigo (E501TCP.CODFPG, do proprio titulo) e descricao por extenso
// (catalogo da tela F066FPG, tabela E066FPG).
//
// Por que o app busca sozinho: o sincronismo automatico de titulos roda no VPS
// (script Python via n8n, fora deste repo) e nao envia o CODFPG. Em vez de
// depender de alterar aquele script, o app le direto da Senior (somente leitura,
// mesmas credenciais do GetDBInfo) em segundo plano. Se o script do VPS passar
// a enviar `codFpg`, a rota de sync grava igual -- os dois caminhos convivem
// (campo ausente no payload = nao mexe).

import { prisma } from "@/lib/prisma";
import { consultarSenior } from "./getDbInfo";
import { dataIso, preenchido } from "./mapeamentoTitulos";

const INTERVALO_MS = 15 * 60 * 1000; // so' titulos abertos, a cada 15 min
const INTERVALO_COMPLETO_MS = 12 * 60 * 60 * 1000; // todos os titulos (historico), a cada 12h
const LIMITE_MS = 240_000;
const LOTE = 50;

let emAndamento: Promise<void> | null = null;
let ultimaExecucao = 0;
let ultimaCompleta = 0;

function comLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sem resposta da Senior em ${Math.round(ms / 1000)}s`)), ms);
    promessa.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/** Catalogo F066FPG (E066FPG): codigo -> descricao por extenso. */
export async function atualizarCatalogoFormasPagamento(): Promise<number> {
  const linhas = await consultarSenior("SELECT * FROM E066FPG");
  const porCodigo = new Map<string, { descricao: string; abreviatura: string | null }>();
  // O catalogo e' por empresa (CODEMP): vale a descricao da empresa 1 (a do app);
  // as outras so' preenchem codigos que a empresa 1 nao tenha.
  const ordenadas = [...linhas].sort((a, b) => Number(b.CODEMP === "1") - Number(a.CODEMP === "1"));
  for (const l of ordenadas) {
    const codigo = (l.CODFPG ?? "").trim();
    const colunaDescricao = l.DESFPG !== undefined ? "DESFPG" : Object.keys(l).find((c) => /^DES/.test(c));
    const descricao = colunaDescricao ? (l[colunaDescricao] ?? "").trim() : "";
    if (!codigo || !descricao || porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, { descricao, abreviatura: (l.ABRFPG ?? "").trim() || null });
  }
  for (const [codigo, v] of porCodigo) {
    await prisma.formaPagamentoSenior.upsert({
      where: { codigo },
      update: { descricao: v.descricao, abreviatura: v.abreviatura },
      create: { codigo, descricao: v.descricao, abreviatura: v.abreviatura },
    });
  }
  return porCodigo.size;
}

/** Grava o CODFPG de cada titulo (so' as linhas que mudaram). Retorna quantos foram atualizados. */
export async function atualizarCodFpgDosTitulos(apenasAbertos: boolean): Promise<number> {
  const filtro = apenasAbertos ? " WHERE SITTIT = 'AB'" : "";
  const linhas = await consultarSenior(`SELECT CODFIL, NUMTIT, CODTPT, CODFOR, DATEMI, CODFPG FROM E501TCP${filtro}`);

  const locais = await prisma.tituloContasAPagar.findMany({
    select: { id: true, numTit: true, codFil: true, codFor: true, tipo: true, dataEmissao: true, codFpg: true },
  });
  const porChave = new Map(
    locais.map((t) => [`${t.numTit}|${t.codFil}|${t.codFor}|${t.tipo}|${t.dataEmissao.toISOString().slice(0, 10)}`, t])
  );

  const mudancas: { id: string; codFpg: string | null }[] = [];
  for (const l of linhas) {
    const local = porChave.get(`${l.NUMTIT}|${l.CODFIL}|${l.CODFOR}|${l.CODTPT}|${dataIso(l.DATEMI)}`);
    if (!local) continue;
    const novo = preenchido(l.CODFPG) ? l.CODFPG.trim() : null;
    if (local.codFpg !== novo) mudancas.push({ id: local.id, codFpg: novo });
  }

  for (let i = 0; i < mudancas.length; i += LOTE) {
    await Promise.all(
      mudancas.slice(i, i + LOTE).map((m) => prisma.tituloContasAPagar.update({ where: { id: m.id }, data: { codFpg: m.codFpg } }))
    );
  }
  return mudancas.length;
}

/**
 * Dispara (sem bloquear quem chamou) a atualizacao do catalogo e do CODFPG dos
 * titulos, no maximo uma por vez e uma a cada 15 min. Falha nunca derruba a tela:
 * so' registra no log e tenta de novo no proximo intervalo. Sem credencial da
 * Senior no ambiente, nao faz nada.
 */
export function garantirFormasPagamentoAtualizadas(): Promise<void> | null {
  if (!process.env.SENIOR_WS_SAPIENS_USER || !process.env.SENIOR_WS_SAPIENS_PASSWORD) return null;
  if (emAndamento) return emAndamento;
  if (Date.now() - ultimaExecucao < INTERVALO_MS) return null;

  ultimaExecucao = Date.now();
  const completa = Date.now() - ultimaCompleta > INTERVALO_COMPLETO_MS;

  // Cada etapa falha sozinha: sem o catalogo ainda da pra gravar o codigo nos
  // titulos (a tela mostra o codigo e "—" na descricao), e vice-versa.
  const etapa = async (nome: string, fn: () => Promise<unknown>, limiteMs = LIMITE_MS): Promise<boolean> => {
    try {
      await comLimite(fn(), limiteMs);
      return true;
    } catch (e: any) {
      console.error(`[formasPagamento] ${nome}:`, String(e?.message ?? e).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200));
      return false;
    }
  };

  emAndamento = (async () => {
    try {
      // em paralelo: um catalogo lento nao atrasa a gravacao dos codigos
      await Promise.all([
        etapa("catalogo F066FPG", () => atualizarCatalogoFormasPagamento(), 90_000),
        etapa("CODFPG dos titulos abertos", () => atualizarCodFpgDosTitulos(true)),
      ]);
      if (completa) {
        // so' conta como varredura completa se terminou; senao tenta de novo no proximo ciclo
        if (await etapa("CODFPG de todos os titulos", () => atualizarCodFpgDosTitulos(false))) ultimaCompleta = Date.now();
      }
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}

/** Catalogo em memoria pra montar a descricao: codigo -> descricao. */
export async function carregarCatalogoFormasPagamento(): Promise<Map<string, string>> {
  const itens = await prisma.formaPagamentoSenior.findMany({ select: { codigo: true, descricao: true } });
  return new Map(itens.map((i) => [i.codigo, i.descricao]));
}
