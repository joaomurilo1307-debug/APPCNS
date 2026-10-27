"use client";

// Cabecalho da aba P0: onde o contrato esta' no P0. Uma faixa de meses (cada coluna = um mes do P0, com a altura do que foi previsto) mostra o que ja'
// passou, o mes em andamento e o que falta, e tres medidores respondem em um olhar: quanto do prazo do P0 ja' correu, quanto do previsto ja' "venceu"
// e como o realizado do Senior esta' contra o previsto nesse mesmo periodo. So' leitura; nada e' estimado.

import { useMemo } from "react";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";

type Props = {
  rotulo: string;
  origem: string | null;
  rotuloNaPlanilha: string | null;
  /** meses do P0 (aaaa-mm), sem lacunas */
  meses: string[];
  /** previsto de cada mes (alinhado a `meses`) */
  previsto: number[];
  /** realizado de cada mes (null = mes sem realizado ainda); null = realizado indisponivel */
  realizado: (number | null)[] | null;
  /** mes corrente (aaaa-mm), o realizado dele e' parcial */
  mesCorrente: string;
};

const Medidor = ({ titulo, destaque, legenda, pct, cor, marcador }: { titulo: string; destaque: React.ReactNode; legenda: React.ReactNode; pct: number; cor: string; marcador?: number }) => (
  <div className="min-w-0 rounded-xl bg-gray-50/80 px-4 py-3">
    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
    <p className="mt-0.5 truncate text-[22px] font-semibold leading-tight tabular-nums tracking-tight text-gray-900">{destaque}</p>
    <div className="relative mt-2 h-2 rounded-full bg-gray-200/80">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: cor }} />
      {marcador !== undefined && <span className="absolute top-[-3px] h-[14px] w-[2px] rounded bg-gray-800" style={{ left: `${Math.max(0, Math.min(100, marcador * 100))}%` }} aria-hidden />}
    </div>
    <p className="mt-1.5 text-[12.5px] leading-snug text-gray-500">{legenda}</p>
  </div>
);

export default function HeroP0({ rotulo, origem, rotuloNaPlanilha, meses, previsto, realizado, mesCorrente }: Props) {
  const n = meses.length;
  const iAtual = mesCorrente ? meses.indexOf(mesCorrente) : -1;
  // meses "fechados": os anteriores ao corrente (todos, se o P0 ja' acabou; nenhum, se ainda nao comecou)
  const fechados = !mesCorrente ? 0 : mesCorrente < meses[0] ? 0 : mesCorrente > meses[n - 1] ? n : iAtual;
  const total = previsto.reduce((s, v) => s + v, 0);
  const previstoVencido = previsto.slice(0, fechados).reduce((s, v) => s + v, 0);
  const realizadoVencido = realizado ? realizado.slice(0, fechados).reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const maxPrev = Math.max(...previsto, 1);
  const semPrevisao = previsto.filter((v) => Math.abs(v) < 0.005).length;

  // anos para a regua embaixo da faixa
  const anos = useMemo(() => meses.map((m, i) => ({ m, i })).filter(({ m, i }) => i === 0 || m.endsWith("-01")), [meses]);
  const pos = (i: number) => `${((i + 0.5) / n) * 100}%`;

  const razao = realizadoVencido !== null && previstoVencido > 0 ? realizadoVencido / previstoVencido : null;
  const corRazao = razao === null ? "#0e9f94" : razao > 1.005 ? "#e5675f" : "#0e9f94";

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-gray-100 bg-gradient-to-r from-brand/[0.08] via-brand/[0.03] to-transparent px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">{rotulo}</span>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Linha de base de custos do contrato</h2>
          </div>
          <p className="mt-1 text-[13.5px] text-gray-600">
            Cobre <b className="font-semibold text-gray-800">{mesLongo(meses[0])}</b> a <b className="font-semibold text-gray-800">{mesLongo(meses[n - 1])}</b> · {n} meses
            {semPrevisao > 0 && <> · {semPrevisao} {semPrevisao === 1 ? "mês" : "meses"} sem previsão (pausa do contrato)</>}
          </p>
        </div>
      </div>

      <div className="px-5 pb-4 pt-4">
        <div className="flex h-12 items-end gap-[2px]" role="img" aria-label={`Faixa dos ${n} meses do P0: ${fechados} fechados, ${iAtual >= 0 ? "1 em andamento" : "nenhum em andamento"}, o resto por vir`}>
          {meses.map((m, i) => {
            const v = previsto[i];
            const pausa = Math.abs(v) < 0.005;
            const atual = i === iAtual;
            const passado = i < fechados;
            const h = pausa ? 3 : Math.max(6, (v / maxPrev) * 48);
            const real = realizado?.[i] ?? null;
            return (
              <div key={m} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${mesLongo(m)}: previsto ${moeda(v)}${pausa ? " (mês sem previsão)" : ""}${real !== null ? ` · realizado ${moeda(real)}${atual ? " (parcial)" : ""}` : ""}`}>
                <div
                  className={`w-full rounded-t-[3px] transition-opacity group-hover:opacity-100 ${pausa ? "bg-gray-300" : atual ? "bg-amber-400" : passado ? "bg-brand" : "bg-brand/25"}`}
                  style={{ height: h, opacity: pausa || atual || !passado ? 1 : 0.9 }}
                />
              </div>
            );
          })}
        </div>
        <div className="relative mt-1.5 h-4 text-[11.5px] text-gray-400">
          {anos.map(({ m, i }) => (
            <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(i), ...(i === 0 ? { transform: "none", left: 0 } : null) }}>
              {i === 0 ? mesCurto(m) : m.slice(0, 4)}
            </span>
          ))}
          <span className="absolute right-0 whitespace-nowrap">{mesCurto(meses[n - 1])}</span>
          {iAtual >= 0 && (
            <span className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-amber-600" style={{ left: pos(iAtual), top: -1 }}>
              ▲ hoje
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Medidor
            titulo="Prazo do P0"
            destaque={
              <>
                {fechados} <span className="text-[15px] font-medium text-gray-400">de {n} meses</span>
              </>
            }
            pct={n ? fechados / n : 0}
            cor="#0e9f94"
            legenda={iAtual >= 0 ? `Estamos em ${mesLongo(mesCorrente)} (mês ${iAtual + 1}); ${n - iAtual - 1} ${n - iAtual - 1 === 1 ? "mês" : "meses"} pela frente` : fechados >= n ? "O período do P0 já terminou" : "O P0 ainda não começou"}
          />
          <Medidor
            titulo="Previsto que já venceu"
            destaque={moedaCompacta(previstoVencido)}
            pct={total ? previstoVencido / total : 0}
            cor="#2a78d6"
            legenda={`${percentual(total ? previstoVencido / total : 0, 1)} dos ${moedaCompacta(total)} previstos no P0, nos meses já fechados`}
          />
          {razao !== null && realizadoVencido !== null ? (
            <Medidor
              titulo="Realizado × previsto"
              destaque={
                <span style={{ color: corRazao }}>
                  {percentual(razao, 0)} <span className="text-[15px] font-medium text-gray-400">do previsto</span>
                </span>
              }
              pct={Math.min(razao, 1.25) / 1.25}
              marcador={1 / 1.25}
              cor={corRazao}
              legenda={`Senior realizou ${moedaCompacta(realizadoVencido)} nos meses fechados, contra ${moedaCompacta(previstoVencido)} previstos (a marca é o previsto)`}
            />
          ) : (
            <Medidor titulo="Realizado × previsto" destaque="—" pct={0} cor="#9aa5b1" legenda={realizado === null ? "Sem o realizado do Senior para comparar" : "Ainda não há mês fechado dentro do P0"} />
          )}
        </div>
        {(origem || rotuloNaPlanilha) && (
          <p className="mt-3 border-t border-gray-100 pt-2.5 text-[12px] leading-snug text-gray-400">
            Fonte: {origem}
            {rotuloNaPlanilha && <> · rótulo do contrato na planilha: {rotuloNaPlanilha}</>}
          </p>
        )}
      </div>
    </section>
  );
}
