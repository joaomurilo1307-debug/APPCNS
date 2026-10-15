// Motor que executa, dentro do APPCNS, o fluxo do dossie de OC que antes rodava no n8n
// ("Consominas - Dossie OC (SeniorX) v6.4", trecho Entrada OC -> Gerar HTML do Dossie).
//
// Os nos Code estao em ./nos/*.js, com o codigo ORIGINAL do n8n (sem alteracoes); fluxo.json guarda
// os demais nos (consulta GetDBInfo, merge, splitOut, switch) e as conexoes. Aqui so' ha' o
// minimo do n8n que esse fluxo usa: itens {json}, $input, $('No'), merge append/combineByPosition,
// splitOut, switch e as chamadas SOAP (GetDBInfo com parametros tipados).
//
// Credenciais NUNCA ficam no fluxo: o corpo SOAP guarda marcadores __SENIOR_USER__/__SENIOR_PASSWORD__.

import fluxoJson from "./fluxo.json";
import { NOS } from "./nos/index.js";

export type Item = { json: any; binary?: any };
type Saidas = Item[][];

// Configuracoes de no do n8n reproduzidas: sempreEmitir (alwaysOutputData: saida vazia vira um item {}) e
// seguirComErro (onError = continueRegularOutput: a excecao vira o item { error } em vez de parar o fluxo).
type Cfg = { sempreEmitir?: boolean; seguirComErro?: boolean };
type NoHttp = Cfg & { tipo: "http"; body: string };
type NoMerge = Cfg & { tipo: "merge"; modo: "append" | "combineByPosition" };
type NoSplit = Cfg & { tipo: "splitOut"; campo: string };
type NoSwitch = Cfg & { tipo: "switch"; regras: { expr: string; igual: string }[]; fallback: boolean };
type NoCode = Cfg & { tipo: "code" };
type No = NoHttp | NoMerge | NoSplit | NoSwitch | NoCode;
type Fluxo = {
  entrada: string;
  saida: string;
  nos: Record<string, No>;
  conexoes: { de: string; saida: number; para: string; entrada: number }[];
};

export type ExecutorHttp = (nome: string, corpo: string, indice: number) => Promise<string>;

export type OpcoesMotor = {
  /** Executa a chamada SOAP (corpo ja renderizado, ainda sem credenciais). */
  http: ExecutorHttp;
  /** Saidas pre-carregadas de nos que nao fazem parte do fluxo (ex.: "Entrada por Titulo" no gabarito). */
  extras?: Record<string, Item[]>;
  /** Chamado depois de cada no (para depurar/comparar com o gabarito). */
  aoTerminar?: (nome: string, saidas: Saidas) => void;
};

const fluxo = fluxoJson as unknown as Fluxo;

function expressao(codigo: string, ctx: { $json: any; $: any; $node: any }) {
  // Expressoes do n8n usadas no fluxo: $json.x, $('No').first().json..., $node["No"].json[...]
  return new Function("$json", "$", "$node", `"use strict"; return (${codigo});`)(ctx.$json, ctx.$, ctx.$node);
}

/** Renderiza um modelo com {{ expressao }} (como o campo "body" do no HTTP do n8n). */
export function renderizar(modelo: string, ctx: { $json: any; $: any; $node: any }): string {
  const sem = modelo.startsWith("=") ? modelo.slice(1) : modelo;
  return sem.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const v = expressao(expr, ctx);
    return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

/** Mescla profunda do Merge "combine by position" do n8n: objetos recursivamente, arrays por indice, o ultimo vence. */
export function fundir(a: any, b: any): any {
  if (b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => fundir(a[i], b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const r: Record<string, any> = { ...a };
    for (const k of Object.keys(b)) r[k] = fundir(a[k], b[k]);
    return r;
  }
  return b;
}

/** Texto do erro como o n8n o devolve para nos Code: "mensagem [line N]" (N relativo ao codigo do no). */
function textoDoErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const linha = e instanceof Error ? /[\\/]nos[\\/][^:\n]*:(\d+):\d+/.exec(e.stack ?? "")?.[1] : undefined;
  return linha ? `${msg} [line ${Math.max(1, Number(linha) - 4)}]` : msg;
}

export async function executarFluxo(entrada: Record<string, unknown>, opcoes: OpcoesMotor): Promise<Map<string, Saidas>> {
  const estado = new Map<string, Saidas>();
  const chamadas = new Map<string, number>();
  estado.set(fluxo.entrada, [[{ json: entrada }]]);
  for (const [nome, itens] of Object.entries(opcoes.extras ?? {})) estado.set(nome, [itens]);

  const entradasDe = new Map<string, { de: string; saida: number; entrada: number }[]>();
  for (const c of fluxo.conexoes) entradasDe.set(c.para, [...(entradasDe.get(c.para) ?? []), { de: c.de, saida: c.saida, entrada: c.entrada }]);

  const $ = (nome: string) => {
    const s = estado.get(nome);
    if (!s) throw new Error(`No "${nome}" ainda nao executou.`);
    const itens = s[0] ?? [];
    return { first: () => itens[0], last: () => itens[itens.length - 1], all: () => itens };
  };
  const $node = new Proxy({}, { get: (_, nome: string) => ({ json: estado.get(nome)?.[0]?.[0]?.json }) });

  const pendentes = Object.keys(fluxo.nos);
  while (pendentes.length) {
    const i = pendentes.findIndex((nome) => (entradasDe.get(nome) ?? []).every((e) => estado.has(e.de)));
    if (i < 0) throw new Error(`Fluxo travado: ${pendentes.join(", ")}`);
    const nome = pendentes.splice(i, 1)[0];
    const def = fluxo.nos[nome];
    const arestas = entradasDe.get(nome) ?? [];
    const nEntradas = Math.max(0, ...arestas.map((a) => a.entrada)) + 1;
    const porEntrada: Item[][] = Array.from({ length: nEntradas }, () => []);
    for (const a of arestas) porEntrada[a.entrada].push(...(estado.get(a.de)?.[a.saida] ?? []));
    const total = porEntrada.reduce((s, x) => s + x.length, 0);
    const nSaidas = def.tipo === "switch" ? def.regras.length + (def.fallback ? 1 : 0) : 1;

    let saidas: Saidas;
    try {
      if (total === 0) {
        saidas = Array.from({ length: nSaidas }, () => []); // sem itens: o no nao executa (como no n8n)
      } else if (def.tipo === "code") {
        const itens = porEntrada[0];
        const entradaN8n = { all: () => itens, first: () => itens[0], last: () => itens[itens.length - 1] };
        const r = await (NOS as Record<string, Function>)[nome](entradaN8n, $, itens[0]?.json, itens);
        const lista = Array.isArray(r) ? r : r === undefined || r === null ? [] : [r];
        saidas = [lista.map((x: any) => (x && typeof x === "object" && "json" in x ? x : { json: x }))];
      } else if (def.tipo === "http") {
        const out: Item[] = [];
        for (const item of porEntrada[0]) {
          let corpo: string;
          try {
            corpo = renderizar(def.body, { $json: item.json, $, $node });
          } catch (e) {
            // O no anterior falhou de proposito (ex.: fornecedor sem compras anteriores -> "Nenhuma OC historica
            // foi selecionada") e o corpo desta consulta depende dele. No n8n isso derrubava o dossie inteiro;
            // aqui a consulta e' pulada e o erro segue como dado, e os nos seguintes tratam como "sem historico".
            out.push({ json: { error: textoDoErro(e) } });
            continue;
          }
          const n = chamadas.get(nome) ?? 0;
          chamadas.set(nome, n + 1);
          out.push({ json: { data: await opcoes.http(nome, corpo, n) } });
        }
        saidas = [out];
      } else if (def.tipo === "merge") {
        if (def.modo === "append") saidas = [porEntrada.flat()];
        else {
          const [a = [], b = []] = porEntrada;
          saidas = [Array.from({ length: Math.min(a.length, b.length) }, (_, k) => ({ json: fundir(a[k].json, b[k].json) }))];
        }
      } else if (def.tipo === "splitOut") {
        saidas = [
          porEntrada[0].flatMap((item) => {
            const v = item.json?.[def.campo];
            return (Array.isArray(v) ? v : [v]).map((el) => ({ json: { ...item.json, [def.campo]: el } }));
          }),
        ];
      } else {
        saidas = Array.from({ length: nSaidas }, () => [] as Item[]);
        for (const item of porEntrada[0]) {
          // Expressao que quebra (ex.: OC sem documento fiscal -> $json.documentosOriginais indefinido) = regra nao casa.
        // No n8n isso derrubaria o fluxo; aqui o item cai na saida "nao mapeado", que o fluxo ja trata.
        let alvo = def.regras.findIndex((r) => {
          try {
            return expressao(r.expr, { $json: item.json, $, $node }) === r.igual;
          } catch {
            return false;
          }
        });
          if (alvo < 0) alvo = def.fallback ? def.regras.length : -1;
          if (alvo >= 0) saidas[alvo].push(item);
        }
      }
    } catch (e) {
      if (!def.seguirComErro) throw e;
      saidas = [[{ json: { error: textoDoErro(e) } }]];
    }
    if (def.sempreEmitir && (saidas[0]?.length ?? 0) === 0) saidas = [[{ json: {} }], ...saidas.slice(1)];
    estado.set(nome, saidas);
    opcoes.aoTerminar?.(nome, saidas);
  }
  return estado;
}

export const NOME_SAIDA = fluxo.saida;
export const NOME_ENTRADA = fluxo.entrada;
