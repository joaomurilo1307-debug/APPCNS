"use client";

// Previsto x Realizado de UM centro de custo -- a replica, dentro do sistema, do relatorio "Analise das Previsoes" / painel gerencial
// das planilhas CONTROLE DE CUSTOS dos coordenadores. O REALIZADO vem sozinho do Senior (ninguem digita); o PREVISTO foi migrado das
// planilhas e pode ser ajustado aqui por quem coordena o centro de custo. Formulas iguais as da planilha (ver lib/custos/previsto.ts).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { soma, type ContratoCusto, type Filtros } from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { baixarCsv } from "@/lib/custos/csv";
import { PLANO_SENIOR } from "@/lib/custos/planoContasSenior";
import { eReembolsavel, grupoDaConta, nomeConta } from "@/lib/custos/planoContas";
import { comparar, grade, lerValor, pacoteDaConta, projetar, serieMensal, type ContaComparada, type LinhaPrevisto, type PacoteComparado } from "@/lib/custos/previsto";
import { useLargura } from "./graficos";
import { Cartao, Kpi, VazioPeriodo } from "./ui";

type Resposta = { podeEditar: boolean; ficha: { responsavel: string | null; objeto: string | null } | null; linhas: LinhaPrevisto[] };

const COR_REAL = "#0e9f94";
const COR_ESTOURO = "#e5675f";
const COR_PREVISTO = "#1f3a5f";
const COR_SEM_PREVISTO = "#9aa5b1";

const tom = (pct: number | null, previsto: number, realizado: number) => {
  if (!previsto && !realizado) return "text-gray-400";
  if (pct === null) return "text-gray-500";
  if (pct > 0.1) return "text-red-600";
  if (pct < -0.1) return "text-sky-700";
  return "text-emerald-700";
};
const pctTexto = (pct: number | null) => (pct === null ? "—" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${percentual(Math.abs(pct), Math.abs(pct) < 0.1 ? 1 : 0)}`);
const sinal = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

// ------------------------------------------------------------------------------------------------ grafico mensal
function GraficoMensal({
  meses,
  previsto,
  realizado,
  acumulado,
  mesParcial,
  altura = 320,
}: {
  meses: string[];
  previsto: number[];
  realizado: number[];
  acumulado: boolean;
  mesParcial?: string;
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const m = { t: 24, r: 18, b: 34, l: 64 };
  const w = largura;
  const areaW = Math.max(10, w - m.l - m.r);
  const areaH = altura - m.t - m.b;
  const acum = (xs: number[]) => {
    let s = 0;
    return xs.map((v) => (s += v));
  };
  const P = acumulado ? acum(previsto) : previsto;
  const R = acumulado ? acum(realizado) : realizado;
  const max = Math.max(1, ...P, ...R);
  const marcas = (() => {
    const bruto = max / 4;
    const exp = Math.floor(Math.log10(bruto));
    const base = Math.pow(10, exp);
    const f = bruto / base;
    const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * base;
    const out: number[] = [];
    for (let v = 0; v <= max + passo * 0.999; v += passo) {
      out.push(v);
      if (v >= max) break;
    }
    return out;
  })();
  const topo = marcas[marcas.length - 1] || 1;
  const y = (v: number) => m.t + areaH - (v / topo) * areaH;
  const banda = areaW / Math.max(1, meses.length);
  const larg = Math.max(10, Math.min(44, banda * 0.58));
  const cx = (i: number) => m.l + banda * i + banda / 2;
  const passoRotulo = banda < 46 ? 2 : 1;
  const eixoTxt = (v: number) => (v === 0 ? "0" : v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : v >= 1_000 ? `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : String(v));

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altura }}>
      <svg width={w} height={altura} role="img" aria-label="Previsto e realizado mês a mês" className="absolute left-0 top-0 block">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="#eef1f5" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
              {eixoTxt(v)}
            </text>
          </g>
        ))}
        {!acumulado &&
          meses.map((mes, i) => {
            const real = R[i];
            const prev = P[i];
            const parcial = mesParcial === mes;
            const cor = !prev ? COR_SEM_PREVISTO : real > prev * 1.1 ? COR_ESTOURO : COR_REAL;
            return (
              <g key={mes} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)}>
                <rect x={m.l + banda * i} y={m.t - 6} width={banda} height={areaH + 6} fill={foco === i ? "rgba(14,159,148,0.07)" : "transparent"} />
                {real > 0 && <rect x={cx(i) - larg / 2} y={y(real)} width={larg} height={Math.max(1, y(0) - y(real))} rx={3} fill={cor} opacity={parcial ? 0.55 : 1} />}
                {prev > 0 && (
                  <>
                    <line x1={cx(i) - larg / 2 - 4} x2={cx(i) + larg / 2 + 4} y1={y(prev)} y2={y(prev)} stroke={COR_PREVISTO} strokeWidth={3} strokeLinecap="round" />
                  </>
                )}
                {(real > 0 || prev > 0) && foco === i && (
                  <text x={cx(i)} y={Math.min(y(real), y(prev || real)) - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill="#111827">
                    {moedaCompacta(real)}
                  </text>
                )}
                {i % passoRotulo === 0 && (
                  <text x={cx(i)} y={altura - 10} textAnchor="middle" fontSize={12.5} fill="#6b7280" fontWeight={foco === i ? 700 : 400}>
                    {mesCurto(mes)}
                    {parcial ? "*" : ""}
                  </text>
                )}
                <title>{`${mesLongo(mes)}\nPrevisto: ${moeda(prev)}\nRealizado: ${moeda(real)}\nDiferença: ${sinal(real - prev)}${moeda(Math.abs(real - prev))}${prev ? ` (${pctTexto(real / prev - 1)})` : ""}`}</title>
              </g>
            );
          })}
        {acumulado && (
          <>
            <polyline fill="none" stroke={COR_PREVISTO} strokeWidth={2.5} strokeDasharray="6 4" points={P.map((v, i) => `${cx(i)},${y(v)}`).join(" ")} />
            <polyline fill="none" stroke={COR_REAL} strokeWidth={3} points={R.map((v, i) => `${cx(i)},${y(v)}`).join(" ")} />
            {meses.map((mes, i) => (
              <g key={mes} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)}>
                <rect x={m.l + banda * i} y={m.t - 6} width={banda} height={areaH + 6} fill={foco === i ? "rgba(14,159,148,0.07)" : "transparent"} />
                <circle cx={cx(i)} cy={y(R[i])} r={foco === i ? 5 : 3.5} fill={COR_REAL} />
                <circle cx={cx(i)} cy={y(P[i])} r={foco === i ? 4.5 : 3} fill="#fff" stroke={COR_PREVISTO} strokeWidth={2} />
                {i % passoRotulo === 0 && (
                  <text x={cx(i)} y={altura - 10} textAnchor="middle" fontSize={12.5} fill="#6b7280" fontWeight={foco === i ? 700 : 400}>
                    {mesCurto(mes)}
                  </text>
                )}
                <title>{`${mesLongo(mes)} (acumulado)\nPrevisto: ${moeda(P[i])}\nRealizado: ${moeda(R[i])}`}</title>
              </g>
            ))}
            {meses.length > 0 && (
              <>
                <text x={w - m.r} y={y(R[R.length - 1]) - 8} textAnchor="end" fontSize={12.5} fontWeight={700} fill={COR_REAL}>
                  {moedaCompacta(R[R.length - 1])}
                </text>
                <text x={w - m.r} y={y(P[P.length - 1]) + 16} textAnchor="end" fontSize={12.5} fontWeight={700} fill={COR_PREVISTO}>
                  {moedaCompacta(P[P.length - 1])}
                </text>
              </>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ barra "bullet" da linha
function BarraBullet({ previsto, realizado }: { previsto: number; realizado: number }) {
  if (!previsto && !realizado) return <div className="h-2 w-full rounded-full bg-gray-100" />;
  const escala = Math.max(previsto, realizado) * 1.02 || 1;
  const wReal = Math.min(100, (realizado / escala) * 100);
  const wPrev = Math.min(100, (previsto / escala) * 100);
  const cor = !previsto ? COR_SEM_PREVISTO : realizado > previsto * 1.1 ? COR_ESTOURO : COR_REAL;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-gray-100" title={`Previsto ${moeda(previsto)} · Realizado ${moeda(realizado)}`}>
      <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${wReal}%`, background: cor }} />
      {previsto > 0 && <div className="absolute top-[-3px] h-[16px] w-[3px] rounded" style={{ left: `calc(${wPrev}% - 1px)`, background: COR_PREVISTO }} />}
    </div>
  );
}

type FiltroLinha = "todas" | "estouro" | "abaixo" | "sem_previsto" | "so_previsto";

// ------------------------------------------------------------------------------------------------ componente
export default function PrevistoRealizado({
  contrato,
  filtros,
  mesesAsc,
  mesCorrente,
  busca,
}: {
  contrato: ContratoCusto;
  filtros: Filtros;
  mesesAsc: string[];
  mesCorrente: string;
  busca: string;
}) {
  const [dados, setDados] = useState<Resposta | "carregando" | "erro">("carregando");
  const [acumulado, setAcumulado] = useState(false);
  const [semMes, setSemMes] = useState(true);
  // padrao: agrupa como nas planilhas e no plano do Senior (Despesas Reembolsaveis dentro de DESPESAS COM PESSOAL), para o quadro bater com o da planilha
  const [comoNaPlanilha, setComoNaPlanilha] = useState(true);
  const [filtroLinha, setFiltroLinha] = useState<FiltroLinha>("todas");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState(false);
  const [futuros, setFuturos] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/custos-conta/previsto?codccu=${contrato.codccu}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setDados(await r.json());
    } catch {
      setDados("erro");
    }
  }, [contrato.codccu]);
  useEffect(() => {
    setDados("carregando");
    void carregar();
  }, [carregar]);

  const idxDe = Math.max(0, mesesAsc.indexOf(filtros.de));
  const idxAte = Math.max(idxDe, mesesAsc.indexOf(filtros.ate));
  const mesesP = mesesAsc.slice(idxDe, idxAte + 1);
  const refParcial = filtros.ate === mesCorrente;

  const linhasPrevisto = dados !== "carregando" && dados !== "erro" ? dados.linhas : [];
  const termo = busca.trim().toLowerCase();
  const passa = useCallback(
    (c: { conta: number | null; pacoteCodigo: string; reembolsavel: boolean }) => {
      if (filtros.grupo !== "todos" && grupoDaConta(c.conta ?? 0).codigo !== filtros.grupo) return false;
      if (filtros.tipo === "reembolsavel" && !c.reembolsavel) return false;
      if (filtros.tipo === "proprio" && c.reembolsavel) return false;
      if (termo) {
        const nome = (c.conta !== null ? nomeConta(c.conta) : "") ?? "";
        if (!nome.toLowerCase().includes(termo)) return false;
      }
      return true;
    },
    [filtros.tipo, filtros.grupo, termo]
  );
  // o realizado e o previsto passam pelo MESMO filtro (tipo de custo, grupo de contas e busca da tela)
  const contratoFiltrado = contrato;

  const comp = useMemo(() => comparar(contratoFiltrado, linhasPrevisto, { meses: mesesP, incluirSemMes: semMes, contaPassa: passa, comoNaPlanilha }), [contratoFiltrado, linhasPrevisto, mesesP, semMes, passa, comoNaPlanilha]);
  const serie = useMemo(() => serieMensal(contratoFiltrado, linhasPrevisto, mesesP, passa), [contratoFiltrado, linhasPrevisto, mesesP, passa]);
  const mesRef = refParcial && mesesP.length > 1 ? mesesP[mesesP.length - 2] : mesesP[mesesP.length - 1];
  const projecao = useMemo(() => {
    const realPorMes = new Map<string, number>();
    const s = serieMensal(contratoFiltrado, [], mesesAsc, passa);
    s.meses.forEach((m, i) => realPorMes.set(m, s.realizado[i]));
    return projetar(realPorMes, linhasPrevisto.filter((l) => passa({ conta: l.conta, pacoteCodigo: pacoteDaConta(l.conta).codigo, reembolsavel: eReembolsavel(l.conta) })), mesRef ?? "");
  }, [contratoFiltrado, linhasPrevisto, mesesAsc, passa, mesRef]);

  const linhaVisivel = (c: ContaComparada) => {
    if (filtroLinha === "estouro") return c.previsto > 0 && c.realizado > c.previsto * 1.1;
    if (filtroLinha === "abaixo") return c.previsto > 0 && c.realizado < c.previsto * 0.9;
    if (filtroLinha === "sem_previsto") return c.situacao === "so_realizado";
    if (filtroLinha === "so_previsto") return c.situacao === "so_previsto";
    return true;
  };
  const pacotes: PacoteComparado[] = comp.pacotes.map((p) => ({ ...p, contas: p.contas.filter(linhaVisivel) })).filter((p) => p.contas.length > 0);

  // ---- leitura automatica (texto do painel gerencial)
  const leitura = useMemo(() => {
    const todas = comp.pacotes.flatMap((p) => p.contas.map((c) => ({ ...c, pacote: p.nome })));
    const estouros = todas.filter((c) => c.previsto > 0 && c.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca).slice(0, 3);
    const sobras = todas.filter((c) => c.previsto > 0 && c.diferenca < 0).sort((a, b) => a.diferenca - b.diferenca).slice(0, 2);
    const semPrev = todas.filter((c) => c.situacao === "so_realizado").sort((a, b) => b.realizado - a.realizado).slice(0, 2);
    const partes: string[] = [];
    if (comp.previsto) partes.push(`No período o realizado ficou ${pctTexto(comp.pct)} em relação ao previsto (${sinal(comp.diferenca)}${moeda(Math.abs(comp.diferenca))}).`);
    if (estouros.length) partes.push(`Maiores estouros: ${estouros.map((c) => `${c.nome} (+${moedaCompacta(c.diferenca)})`).join(", ")}.`);
    if (sobras.length) partes.push(`Mais abaixo do previsto: ${sobras.map((c) => `${c.nome} (${moedaCompacta(c.diferenca)})`).join(", ")}.`);
    if (semPrev.length) partes.push(`Custo sem previsto: ${semPrev.map((c) => `${c.nome} (${moedaCompacta(c.realizado)})`).join(", ")}.`);
    return partes;
  }, [comp]);

  // ---- grade de edicao (conta x mes), com meses futuros opcionais
  const mesesGrade = useMemo(() => {
    const out = [...mesesP];
    if (futuros) {
      const ult = out[out.length - 1] ?? mesesAsc[mesesAsc.length - 1];
      const maxPrev = linhasPrevisto.reduce((m, l) => (l.competencia && l.competencia > m ? l.competencia : m), ult);
      let [a, m] = ult.split("-").map(Number);
      const fim = maxPrev > `${a}-12` ? maxPrev : `${a}-12`;
      while (true) {
        m++;
        if (m > 12) {
          m = 1;
          a++;
        }
        const k = `${a}-${String(m).padStart(2, "0")}`;
        if (k > fim) break;
        out.push(k);
      }
    }
    return out;
  }, [mesesP, futuros, linhasPrevisto, mesesAsc]);
  const gradePrev = useMemo(() => grade(linhasPrevisto), [linhasPrevisto]);
  const realizadoConta = useMemo(() => {
    const mapa = new Map<number, Map<string, number>>();
    for (const c of contrato.contas) {
      if (c.codigo === null) continue;
      const m = new Map<string, number>();
      for (const x of c.meses) m.set(x.competencia.slice(0, 7), x.valor);
      mapa.set(c.codigo, m);
    }
    return mapa;
  }, [contrato.contas]);
  const contasDaGrade = useMemo(() => {
    const cod = new Set<number>();
    for (const c of contrato.contas) if (c.codigo !== null && passa({ conta: c.codigo, pacoteCodigo: pacoteDaConta(c.codigo).codigo, reembolsavel: c.reembolsavel })) cod.add(c.codigo);
    for (const [conta] of gradePrev) if (passa({ conta, pacoteCodigo: pacoteDaConta(conta).codigo, reembolsavel: eReembolsavel(conta) })) cod.add(conta);
    return Array.from(cod).sort((a, b) => (pacoteDaConta(a).nome + (nomeConta(a) ?? "")).localeCompare(pacoteDaConta(b).nome + (nomeConta(b) ?? ""), "pt-BR"));
  }, [contrato.contas, gradePrev, passa]);

  async function salvarCelula(conta: number, mes: string, texto: string) {
    const v = lerValor(texto === "" ? "0" : texto);
    if (v === null || v < 0) {
      setMsg("Valor inválido: use só números (ex.: 1.250,00).");
      return;
    }
    const atual = gradePrev.get(conta)?.get(mes) ?? 0;
    if (Math.abs(atual - v) < 0.005) return;
    setMsg("Salvando…");
    const r = await fetch("/api/custos-conta/previsto/grade", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codccu: contrato.codccu, conta, competencia: mes, valor: v }) });
    if (!r.ok) {
      setMsg((await r.json().catch(() => ({}))).error ?? "Não foi possível salvar.");
      return;
    }
    await carregar();
    setMsg("Salvo.");
    setTimeout(() => setMsg(null), 1800);
  }

  const [novaConta, setNovaConta] = useState("");
  const contasParaAdicionar = useMemo(
    () =>
      PLANO_SENIOR.filter(([cod, , clafin, nivel, sit]) => nivel >= 3 && sit === "A" && !clafin.startsWith("217") && !contasDaGrade.includes(cod))
        .map(([cod]) => ({ cod, nome: nomeConta(cod) ?? String(cod), pacote: pacoteDaConta(cod).nome }))
        .sort((a, b) => (a.pacote + a.nome).localeCompare(b.pacote + b.nome, "pt-BR")),
    [contasDaGrade]
  );
  const [extras, setExtras] = useState<number[]>([]);
  const contasNaGrade = useMemo(() => Array.from(new Set([...contasDaGrade, ...extras])), [contasDaGrade, extras]);

  function exportar() {
    const cab = ["Pacote", "Conta", "Previsto", "Realizado", "Realizado − Previsto", "% (realizado/previsto − 1)"];
    const corpo: (string | number)[][] = [];
    for (const p of comp.pacotes) {
      corpo.push([p.nome, "", p.previsto, p.realizado, p.diferenca, p.pct ?? ""]);
      for (const c of p.contas) corpo.push([p.nome, c.nome, c.previsto, c.realizado, c.diferenca, c.pct ?? ""]);
    }
    corpo.push(["TOTAL GERAL", "", comp.previsto, comp.realizado, comp.diferenca, comp.pct ?? ""]);
    baixarCsv(`previsto_x_realizado_${contrato.codccu}_${filtros.de}_a_${filtros.ate}.csv`, [cab, ...corpo]);
  }

  if (dados === "carregando") return <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" aria-busy />;
  if (dados === "erro") return <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-sm text-red-700">Não foi possível carregar o previsto deste centro de custo. Tente atualizar a tela.</p>;

  const temPrevisto = linhasPrevisto.length > 0;
  const semPrevistoNoPeriodo = comp.previsto === 0 && comp.previstoSemMes === 0;

  return (
    <div className="space-y-5">
      <FichaCentro codccu={contrato.codccu} ficha={dados.ficha} podeEditar={dados.podeEditar} aoSalvar={carregar} />

      {!temPrevisto && (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-5 py-4 text-sm text-amber-900">
          <b>Este centro de custo ainda não tem previsto cadastrado.</b> O realizado abaixo já está completo (vem do Senior).{" "}
          {dados.podeEditar ? "Use “Editar previsto” para lançar o previsto mês a mês." : "Peça a quem coordena o centro de custo para lançar o previsto."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Previsto no período" valor={moedaCompacta(comp.previsto)} detalhe={comp.previstoSemMes && !semMes ? `+ ${moedaCompacta(comp.previstoSemMes)} sem mês definido` : `${mesesP.length} ${mesesP.length === 1 ? "mês" : "meses"}`} />
        <Kpi rotulo="Realizado no período" valor={moedaCompacta(comp.realizado)} detalhe={refParcial ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">mês em andamento · só o já pago</span> : "pago no Senior"} destaque />
        <Kpi
          rotulo="Realizado − previsto"
          valor={<span className={tom(comp.pct, comp.previsto, comp.realizado)}>{comp.previsto || comp.realizado ? `${sinal(comp.diferenca)}${moedaCompacta(Math.abs(comp.diferenca))}` : "—"}</span>}
          detalhe={comp.previsto ? <span className={`font-medium ${tom(comp.pct, comp.previsto, comp.realizado)}`}>{pctTexto(comp.pct)} sobre o previsto</span> : "sem previsto para comparar"}
        />
        <Kpi
          rotulo="Assertividade do previsto"
          valor={comp.assertividade === null ? "—" : percentual(comp.assertividade, 1)}
          detalhe={
            comp.assertividade === null ? (
              "precisa de previsto no período"
            ) : (
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100" title="1 − |desvio %|: quanto o realizado ficou perto do previsto">
                <div className="h-full rounded-full" style={{ width: `${comp.assertividade * 100}%`, background: comp.assertividade >= 0.9 ? COR_REAL : comp.assertividade >= 0.7 ? "#eda100" : COR_ESTOURO }} />
              </div>
            )
          }
        />
        <Kpi
          rotulo="Previsto do contrato consumido"
          valor={projecao.consumido === null ? "—" : percentual(projecao.consumido, 0)}
          detalhe={projecao.previstoTotal ? `${moedaCompacta(projecao.realizadoAteAgora)} de ${moedaCompacta(projecao.previstoTotal)} · termina em ${moedaCompacta(projecao.projetadoNoFim)}` : "sem previsto total"}
        />
      </div>

      {semPrevistoNoPeriodo && !temPrevisto ? null : (
        <Cartao
          titulo="Previsto × realizado mês a mês"
          subtitulo={
            <>
              Barra = realizado do Senior · traço escuro = previsto · <span className="font-medium text-red-600">vermelho</span> = mais de 10% acima do previsto
              {refParcial && <> · <span className="font-medium">* mês em andamento</span></>}
            </>
          }
          acao={
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group">
              {([false, true] as const).map((a) => (
                <button key={String(a)} type="button" onClick={() => setAcumulado(a)} className={`px-3 py-1.5 text-[13px] font-medium ${acumulado === a ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {a ? "Acumulado" : "Mensal"}
                </button>
              ))}
            </div>
          }
        >
          <GraficoMensal meses={serie.meses} previsto={serie.previsto} realizado={serie.realizado} acumulado={acumulado} mesParcial={refParcial ? mesCorrente : undefined} />
        </Cartao>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Cartao
          titulo="Análise das previsões"
          subtitulo="Pacote → conta, como no relatório da planilha. Realizado − previsto e % (realizado ÷ previsto − 1)."
          acao={
            <div className="flex flex-wrap items-center gap-2">
              <select value={filtroLinha} onChange={(e) => setFiltroLinha(e.target.value as FiltroLinha)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] focus:border-brand focus:outline-none" aria-label="Mostrar">
                <option value="todas">Todas as contas</option>
                <option value="estouro">Acima do previsto (+10%)</option>
                <option value="abaixo">Abaixo do previsto (−10%)</option>
                <option value="sem_previsto">Com custo e sem previsto</option>
                <option value="so_previsto">Com previsto e sem custo</option>
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-gray-600" title="Ligado: igual à planilha (Despesas Reembolsáveis dentro do pacote DESPESAS COM PESSOAL). Desligado: reembolsáveis em grupos próprios, como na tela de custo.">
                <input type="checkbox" checked={comoNaPlanilha} onChange={(e) => setComoNaPlanilha(e.target.checked)} className="h-3.5 w-3.5 accent-[#00A99D]" /> Pacotes como na planilha
              </label>
              <button type="button" onClick={exportar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50">
                Exportar (CSV)
              </button>
            </div>
          }
        >
          {pacotes.length === 0 ? (
            <VazioPeriodo texto="Nenhuma conta com previsto ou custo neste período e filtro." />
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full border-separate border-spacing-0 text-[15px]">
                <thead>
                  <tr className="text-left text-[13px] uppercase tracking-wide text-gray-500">
                    <th className="border-b border-gray-200 py-2 pr-3 font-semibold">Pacote / conta</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Previsto</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Realizado</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Real. − prev.</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">%</th>
                    <th className="hidden min-w-[9rem] border-b border-gray-200 px-3 py-2 font-semibold md:table-cell">Realizado vs previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {pacotes.map((p) => {
                    const fechado = fechados.has(p.codigo);
                    return (
                      <Fragment key={p.codigo}>
                        <tr
                          className="cursor-pointer bg-gray-50/80"
                          onClick={() =>
                            setFechados((a) => {
                              const n = new Set(a);
                              if (n.has(p.codigo)) n.delete(p.codigo);
                              else n.add(p.codigo);
                              return n;
                            })
                          }
                        >
                          <td className="border-b border-gray-100 py-2 pr-3 font-semibold text-gray-800">
                            <span className="mr-2 text-xs text-gray-400">{fechado ? "▶" : "▼"}</span>
                            {p.nome}
                            <span className="ml-2 text-xs font-normal text-gray-400">{p.contas.length} {p.contas.length === 1 ? "conta" : "contas"}</span>
                          </td>
                          <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums">{moeda(p.previsto)}</td>
                          <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums">{moeda(p.realizado)}</td>
                          <td className={`border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums ${tom(p.pct, p.previsto, p.realizado)}`}>{sinal(p.diferenca)}{moeda(Math.abs(p.diferenca))}</td>
                          <td className={`border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums ${tom(p.pct, p.previsto, p.realizado)}`}>{pctTexto(p.pct)}</td>
                          <td className="hidden border-b border-gray-100 px-3 py-2 md:table-cell">
                            <BarraBullet previsto={p.previsto} realizado={p.realizado} />
                          </td>
                        </tr>
                        {!fechado &&
                          p.contas.map((c) => (
                            <tr key={`${p.codigo}-${c.conta ?? c.nome}`} className="hover:bg-gray-50/70">
                              <td className="border-b border-gray-100 py-1.5 pl-7 pr-3 text-gray-700">
                                {c.nome}
                                {c.situacao === "so_realizado" && <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">sem previsto</span>}
                                {c.situacao === "so_previsto" && <span className="ml-2 rounded-full bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">sem custo</span>}
                              </td>
                              <td className="border-b border-gray-100 px-3 py-1.5 text-right tabular-nums text-gray-700">{c.previsto ? moeda(c.previsto) : "–"}</td>
                              <td className="border-b border-gray-100 px-3 py-1.5 text-right tabular-nums text-gray-800">{c.realizado ? moeda(c.realizado) : "–"}</td>
                              <td className={`border-b border-gray-100 px-3 py-1.5 text-right tabular-nums ${tom(c.pct, c.previsto, c.realizado)}`}>{c.diferenca ? `${sinal(c.diferenca)}${moeda(Math.abs(c.diferenca))}` : "–"}</td>
                              <td className={`border-b border-gray-100 px-3 py-1.5 text-right tabular-nums ${tom(c.pct, c.previsto, c.realizado)}`}>{pctTexto(c.pct)}</td>
                              <td className="hidden border-b border-gray-100 px-3 py-1.5 md:table-cell">
                                <BarraBullet previsto={c.previsto} realizado={c.realizado} />
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="bg-gray-100 py-2.5 pr-3 text-gray-800">Total geral</td>
                    <td className="bg-gray-100 px-3 py-2.5 text-right tabular-nums">{moeda(comp.previsto)}</td>
                    <td className="bg-gray-100 px-3 py-2.5 text-right tabular-nums">{moeda(comp.realizado)}</td>
                    <td className={`bg-gray-100 px-3 py-2.5 text-right tabular-nums ${tom(comp.pct, comp.previsto, comp.realizado)}`}>{sinal(comp.diferenca)}{moeda(Math.abs(comp.diferenca))}</td>
                    <td className={`bg-gray-100 px-3 py-2.5 text-right tabular-nums ${tom(comp.pct, comp.previsto, comp.realizado)}`}>{pctTexto(comp.pct)}</td>
                    <td className="hidden bg-gray-100 md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={semMes} onChange={(e) => setSemMes(e.target.checked)} className="h-3.5 w-3.5 accent-[#00A99D]" />
            Incluir o previsto sem mês definido ({moeda(comp.previstoSemMes)}) — compras do contrato que a planilha lançou sem data
          </label>
        </Cartao>

        <Cartao titulo="Painel gerencial" subtitulo="Desvio por pacote e leitura automática do período">
          {comp.pacotes.length === 0 ? (
            <VazioPeriodo texto="Sem dados no período." />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2.5">
                {[...comp.pacotes]
                  .filter((p) => p.previsto > 0 || p.realizado > 0)
                  .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
                  .slice(0, 8)
                  .map((p) => {
                    const maxAbs = Math.max(1, ...comp.pacotes.map((x) => Math.abs(x.diferenca)));
                    const w = Math.max(2, (Math.abs(p.diferenca) / maxAbs) * 50);
                    return (
                      <div key={p.codigo} title={`${p.nome}: previsto ${moeda(p.previsto)} · realizado ${moeda(p.realizado)}`}>
                        <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[13px]">
                          <span className="truncate text-gray-700">{p.nome}</span>
                          <span className={`shrink-0 font-semibold tabular-nums ${tom(p.pct, p.previsto, p.realizado)}`}>
                            {sinal(p.diferenca)}
                            {moedaCompacta(Math.abs(p.diferenca))} · {pctTexto(p.pct)}
                          </span>
                        </div>
                        <div className="relative h-2.5 rounded-full bg-gray-100">
                          <div className="absolute left-1/2 top-[-2px] h-[14px] w-px bg-gray-300" />
                          <div
                            className="absolute top-0 h-full rounded-full"
                            style={{ width: `${w}%`, left: p.diferenca >= 0 ? "50%" : `${50 - w}%`, background: p.diferenca > 0 ? COR_ESTOURO : COR_REAL }}
                          />
                        </div>
                      </div>
                    );
                  })}
                <p className="text-xs text-gray-400">← abaixo do previsto · acima do previsto →</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-[14px] leading-relaxed text-gray-700">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Leitura do período</p>
                {leitura.length ? leitura.map((t, i) => <p key={i} className={i ? "mt-1.5" : ""}>{t}</p>) : <p>Lance o previsto para ver a comparação.</p>}
              </div>
            </div>
          )}
        </Cartao>
      </div>

      <Cartao
        titulo="Previsto mês a mês"
        subtitulo={
          dados.podeEditar
            ? "Cada célula é o previsto da conta no mês. Clique em “Editar previsto”, digite o valor e saia da célula para salvar. O realizado do Senior aparece embaixo, em cinza."
            : "Previsto de cada conta por mês, com o realizado do Senior embaixo, em cinza. Só quem coordena o centro de custo edita."
        }
        acao={
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            {msg && <span className={`font-medium ${msg.startsWith("Salvo") || msg === "Salvando…" ? "text-emerald-700" : "text-red-600"}`}>{msg}</span>}
            <label className="flex cursor-pointer items-center gap-1.5 text-gray-600">
              <input type="checkbox" checked={futuros} onChange={(e) => setFuturos(e.target.checked)} className="h-4 w-4 accent-[#00A99D]" /> Meses futuros
            </label>
            {dados.podeEditar && (
              <button type="button" onClick={() => setEditando((e) => !e)} className={`rounded-lg border px-3 py-1.5 font-medium transition ${editando ? "border-brand bg-brand text-white" : "border-brand text-brand hover:bg-brand-light"}`}>
                {editando ? "Concluir edição" : "Editar previsto"}
              </button>
            )}
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-gray-500">
                <th className="sticky left-0 z-10 min-w-[16rem] border-b border-gray-200 bg-white py-2 pr-3 font-semibold">Conta</th>
                {mesesGrade.map((m) => (
                  <th key={m} className="border-b border-gray-200 px-1 py-2 text-right font-semibold">
                    {mesCurto(m)}
                  </th>
                ))}
                <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Total prev.</th>
              </tr>
            </thead>
            <tbody>
              {contasNaGrade.map((cod) => {
                const prevLinha = gradePrev.get(cod);
                const realLinha = realizadoConta.get(cod);
                const totalPrev = mesesGrade.reduce((s, m) => s + (prevLinha?.get(m) ?? 0), 0);
                return (
                  <Fragment key={cod}>
                    <tr className="hover:bg-gray-50/70">
                      <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-1 pr-3 text-gray-800">
                        <span className="truncate" title={pacoteDaConta(cod).nome}>
                          {nomeConta(cod) ?? cod}
                        </span>
                      </td>
                      {mesesGrade.map((m) => {
                        const v = prevLinha?.get(m) ?? 0;
                        const real = realLinha?.get(m) ?? 0;
                        return (
                          <td key={m} className="border-b border-gray-100 px-0.5 py-0.5 text-right">
                            {editando ? (
                              <input
                                defaultValue={v ? String(v).replace(".", ",") : ""}
                                key={`${cod}-${m}-${v}`}
                                inputMode="decimal"
                                onBlur={(e) => salvarCelula(cod, m, e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                aria-label={`Previsto de ${nomeConta(cod)} em ${mesLongo(m)}`}
                                className="w-[4.6rem] rounded-md border border-gray-200 px-1.5 py-1 text-right tabular-nums focus:border-brand focus:outline-none"
                              />
                            ) : (
                              <span className={`block px-1.5 py-1 tabular-nums ${v ? "font-medium text-gray-800" : "text-gray-300"}`}>{v ? moedaCompacta(v).replace("R$ ", "") : "–"}</span>
                            )}
                            {real ? <span className={`block px-1.5 text-[11px] tabular-nums ${v && real > v * 1.1 ? "text-red-500" : "text-gray-400"}`}>{moedaCompacta(real).replace("R$ ", "")}</span> : null}
                          </td>
                        );
                      })}
                      <td className="border-b border-gray-100 px-3 py-1 text-right font-medium tabular-nums text-gray-800">{totalPrev ? moeda(totalPrev) : "–"}</td>
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 bg-gray-100 py-2 pr-3 text-gray-800">Total previsto</td>
                {mesesGrade.map((m) => {
                  const t = contasNaGrade.reduce((s, c) => s + (gradePrev.get(c)?.get(m) ?? 0), 0);
                  return (
                    <td key={m} className="bg-gray-100 px-1 py-2 text-right text-[13px] tabular-nums">
                      {t ? moedaCompacta(t).replace("R$ ", "") : "–"}
                    </td>
                  );
                })}
                <td className="bg-gray-100 px-3 py-2 text-right tabular-nums">{moeda(soma(contasNaGrade.map((c) => mesesGrade.reduce((s, m) => s + (gradePrev.get(c)?.get(m) ?? 0), 0))))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {editando && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-[13px]">
            <label className="text-gray-600" htmlFor="nova-conta">
              Adicionar conta ao previsto:
            </label>
            <select id="nova-conta" value={novaConta} onChange={(e) => setNovaConta(e.target.value)} className="max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:border-brand focus:outline-none">
              <option value="">Escolha uma conta…</option>
              {contasParaAdicionar.map((c) => (
                <option key={c.cod} value={c.cod}>
                  {c.pacote} · {c.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!novaConta}
              onClick={() => {
                setExtras((a) => [...a, Number(novaConta)]);
                setNovaConta("");
              }}
              className="rounded-lg border border-brand px-3 py-1.5 font-medium text-brand hover:bg-brand-light disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        )}
      </Cartao>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ ficha (responsavel / objeto)
function FichaCentro({ codccu, ficha, podeEditar, aoSalvar }: { codccu: string; ficha: Resposta["ficha"]; podeEditar: boolean; aoSalvar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [responsavel, setResponsavel] = useState(ficha?.responsavel ?? "");
  const [objeto, setObjeto] = useState(ficha?.objeto ?? "");
  useEffect(() => {
    setResponsavel(ficha?.responsavel ?? "");
    setObjeto(ficha?.objeto ?? "");
  }, [ficha]);

  async function salvar() {
    const r = await fetch("/api/custos-conta/previsto/ficha", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codccu, responsavel: responsavel || null, objeto: objeto || null }) });
    if (r.ok) {
      setEditando(false);
      aoSalvar();
    } else alert((await r.json().catch(() => ({}))).error ?? "Não foi possível salvar.");
  }

  if (!ficha?.responsavel && !ficha?.objeto && !podeEditar) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-soft">
      {editando ? (
        <div className="grid w-full gap-2 md:grid-cols-[16rem_1fr_auto]">
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Responsável (coordenador)" className="rounded-lg border border-gray-200 px-3 py-1.5 text-[14px] focus:border-brand focus:outline-none" />
          <input value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Objeto do contrato" className="rounded-lg border border-gray-200 px-3 py-1.5 text-[14px] focus:border-brand focus:outline-none" />
          <div className="flex gap-2">
            <button type="button" onClick={salvar} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white">Salvar</button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Responsável</p>
            <p className="text-[15px] font-medium text-gray-900">{ficha?.responsavel || "—"}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Objeto</p>
            <p className="text-[15px] text-gray-700">{ficha?.objeto || "—"}</p>
          </div>
          {podeEditar && (
            <button type="button" onClick={() => setEditando(true)} className="text-[13px] font-medium text-brand hover:text-brand-dark">
              editar
            </button>
          )}
        </>
      )}
    </div>
  );
}
