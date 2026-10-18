"use client";

// Mapa de blocos (treemap) do custo de um centro de custo: pacote (tipo de custo) -> conta. A area de cada bloco e' proporcional ao custo no
// periodo; a cor e' a do tipo de custo (a mesma de todas as telas). So' dado do Senior, ja agregado pela tela (nada novo e' buscado).

import { useState } from "react";
import { moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { COR_DEMAIS } from "@/lib/custos/agregacao";
import { useLargura } from "./graficos";
import { Cartao } from "./ui";

export type ItemMapa = { grupo: string; grupoNome: string; conta: string; valor: number };
type Retangulo = { x: number; y: number; w: number; h: number };
type No<T> = { item: T; valor: number };

/** Divide a area em retangulos proporcionais aos valores (corte equilibrado em duas metades, alternando a direcao pelo formato). */
function dividir<T>(nos: No<T>[], r: Retangulo, saida: { item: T; r: Retangulo }[]) {
  if (nos.length === 0) return;
  if (nos.length === 1) {
    saida.push({ item: nos[0].item, r });
    return;
  }
  const total = nos.reduce((s, n) => s + n.valor, 0);
  let acum = 0;
  let corte = 1;
  for (let i = 0; i < nos.length - 1; i++) {
    if (acum + nos[i].valor / 2 >= total / 2) break;
    acum += nos[i].valor;
    corte = i + 1;
  }
  if (acum === 0) corte = 1;
  const a = nos.slice(0, corte);
  const b = nos.slice(corte);
  const fa = a.reduce((s, n) => s + n.valor, 0) / total;
  if (r.w >= r.h) {
    dividir(a, { x: r.x, y: r.y, w: r.w * fa, h: r.h }, saida);
    dividir(b, { x: r.x + r.w * fa, y: r.y, w: r.w * (1 - fa), h: r.h }, saida);
  } else {
    dividir(a, { x: r.x, y: r.y, w: r.w, h: r.h * fa }, saida);
    dividir(b, { x: r.x, y: r.y + r.h * fa, w: r.w, h: r.h * (1 - fa) }, saida);
  }
}

export default function MapaDoCusto({ itens, cores, altura = 380 }: { itens: ItemMapa[]; cores: Map<string, string>; altura?: number }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<string | null>(null);
  const positivos = itens.filter((i) => i.valor > 0);
  const total = positivos.reduce((s, i) => s + i.valor, 0);

  // 1) grupos; 2) contas dentro de cada grupo
  const porGrupo = new Map<string, { nome: string; valor: number; contas: ItemMapa[] }>();
  for (const i of positivos) {
    const g = porGrupo.get(i.grupo) ?? { nome: i.grupoNome, valor: 0, contas: [] };
    g.valor += i.valor;
    g.contas.push(i);
    porGrupo.set(i.grupo, g);
  }
  const grupos = Array.from(porGrupo.entries()).map(([codigo, g]) => ({ codigo, ...g })).sort((a, b) => b.valor - a.valor);
  const gaps: { item: (typeof grupos)[number]; r: Retangulo }[] = [];
  dividir(grupos.map((g) => ({ item: g, valor: g.valor })), { x: 0, y: 0, w: Math.max(10, largura), h: altura }, gaps);

  return (
    <Cartao titulo="Mapa do custo" subtitulo="Cada bloco é uma conta; o tamanho é o custo no período e a cor é o tipo de custo. Passe o mouse para ver o valor e a participação.">
      <div ref={ref} className="relative w-full select-none overflow-hidden rounded-xl bg-gray-50" style={{ height: altura }}>
        <svg width={largura} height={altura} role="img" aria-label="Mapa de blocos do custo por tipo e conta" className="absolute left-0 top-0 block">
          {gaps.map(({ item: g, r }) => {
            const cor = cores.get(g.codigo) ?? COR_DEMAIS;
            const contas: { item: ItemMapa; r: Retangulo }[] = [];
            const pad = 2;
            const titulo = r.w > 90 && r.h > 40 ? 18 : 0;
            dividir([...g.contas].sort((a, b) => b.valor - a.valor).map((c) => ({ item: c, valor: c.valor })), { x: r.x + pad, y: r.y + pad + titulo, w: Math.max(1, r.w - pad * 2), h: Math.max(1, r.h - pad * 2 - titulo) }, contas);
            return (
              <g key={g.codigo}>
                <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={6} fill={cor} opacity={0.14} />
                {titulo > 0 && (
                  <text x={r.x + 8} y={r.y + 15} fontSize={12} fontWeight={700} fill="#1f2937">
                    {g.nome} · {moedaCompacta(g.valor)}
                  </text>
                )}
                {contas.map(({ item: c, r: rc }) => {
                  const id = `${c.grupo}|${c.conta}`;
                  const ativo = foco === id;
                  const grande = rc.w > 84 && rc.h > 34;
                  return (
                    <g key={id} onMouseEnter={() => setFoco(id)} onMouseLeave={() => setFoco(null)}>
                      <title>{`${c.conta}\n${c.grupoNome}\n${moeda(c.valor)} · ${percentual(total ? c.valor / total : 0, 1)} do centro de custo`}</title>
                      <rect x={rc.x + 1} y={rc.y + 1} width={Math.max(0, rc.w - 2)} height={Math.max(0, rc.h - 2)} rx={4} fill={cor} opacity={ativo ? 1 : 0.82} stroke="#fff" strokeWidth={1.5} />
                      {grande && (
                        <>
                          <text x={rc.x + 8} y={rc.y + 18} fontSize={12.5} fontWeight={600} fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.18)", strokeWidth: 2 }}>
                            {c.conta.length > Math.floor(rc.w / 7.4) ? c.conta.slice(0, Math.max(3, Math.floor(rc.w / 7.4) - 1)) + "…" : c.conta}
                          </text>
                          <text x={rc.x + 8} y={rc.y + 34} fontSize={12} fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.18)", strokeWidth: 2 }}>
                            {moedaCompacta(c.valor)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </Cartao>
  );
}
