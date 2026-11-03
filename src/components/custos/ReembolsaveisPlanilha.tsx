"use client";

// "Despesas reembolsaveis" abaixo do "Pagos / semana" (pedido do Joao, 03/11/2026): a planilha que a Cristina preenche (RELATORIO DE DESPESAS REEMBOLSAVEIS: DOC.,
// prestador, CPF/CNPJ, data de realizacao, TIPO DE SERVICO, valor, descricao) montada com as notas do Senior em contas reembolsaveis que VENCEM no mes (pagas ou em aberto,
// a mesma regra da planilha dela), com o resumo por tipo de servico e Excel no layout dela. Aba recolhida: so' carrega quando abre; depois acompanha o Senior sozinha.
// Somente leitura. O tipo de servico das contas antigas e' SUGERIDO pelo texto (marcado); BDI e tributos nao sao calculados aqui.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BotaoExcel from "@/components/BotaoExcel";
import CabecalhoAba from "./CabecalhoAba";
import { useSeguirSenior } from "./useSeguirSenior";
import type { AbaExcel } from "@/lib/exportarExcel";
import { mesLongo, moeda } from "@/lib/custos/formato";
import { DIAS_PARCELA_ANTIGA, NAO_CLASSIFICADO, TIPOS_DE_SERVICO, type LinhaReembolso, type ResumoReembolso } from "@/lib/contratos/reembolsaveis";

type Resposta = { textosPendentes?: number; mes: string; linhas: LinhaReembolso[]; antigas?: LinhaReembolso[]; emitidas?: LinhaReembolso[]; resumo: ResumoReembolso; centros: { codccu: string; nome: string; n: number }[]; atualizadoEm: { custo: string | null; titulos: string | null } };

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ultimoDia = (mes: string) => { const [a, m] = mes.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

export default function ReembolsaveisPlanilha({ codccu }: { codccu?: string }) {
  const mesAtual = hojeBR().slice(0, 7);
  const [abaAberta, setAbaAberta] = useState(false); // fechada por padrao: so' carrega quando a pessoa abre
  const [mes, setMes] = useState(mesAtual);
  const [centro, setCentro] = useState("");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const consultaRef = useRef("");
  const dadosRef = useRef<Resposta | null>(null);

  const ccu = codccu ?? centro;
  const consulta = useMemo(() => {
    const p = new URLSearchParams({ mes });
    if (ccu) p.set("ccu", ccu);
    if (tipo) p.set("tipo", tipo);
    if (buscaAplicada) p.set("q", buscaAplicada);
    return p.toString();
  }, [mes, ccu, tipo, buscaAplicada]);

  const carregar = useCallback(async () => {
    consultaRef.current = consulta;
    try {
      const r = await fetch(`/api/custos-conta/reembolsaveis?${consulta}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (consultaRef.current !== consulta) return; // resposta velha: ignora
      if (!r.ok) throw new Error(j.error || "Não foi possível carregar os reembolsáveis.");
      dadosRef.current = j;
      setDados(j);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os reembolsáveis.");
    }
  }, [consulta]);

  useEffect(() => { if (abaAberta) void carregar(); }, [carregar, abaAberta]);
  // enquanto o servidor le do Senior a descricao de titulos que o sistema ainda nao tinha, volta a perguntar de poucos em poucos segundos (ate 40 vezes)
  const pendentes = dados?.textosPendentes ?? 0;
  useEffect(() => {
    if (!abaAberta || pendentes <= 0) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 40) clearInterval(t); else void carregar(); }, 8000);
    return () => clearInterval(t);
  }, [abaAberta, pendentes, carregar]);
  const { atualizando, pedirAtualizacao } = useSeguirSenior(abaAberta, carregar, () => dadosRef.current?.atualizadoEm.custo);
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const meses = useMemo(() => {
    const lista: string[] = [];
    let [a, m] = [2026, 1];
    const [fa, fm] = mesAtual.split("-").map(Number);
    while (a < fa || (a === fa && m <= fm)) { lista.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
    return lista;
  }, [mesAtual]);
  const indice = meses.indexOf(mes);
  const linhas = dados?.linhas ?? [];
  const resumo = dados?.resumo;
  const naoClass = resumo?.porTipo.find((p) => p.tipo === NAO_CLASSIFICADO);
  const sugeridas = linhas.filter((l) => l.origemTipo === "sugerido").length;
  const emitidas = dados?.emitidas ?? [];
  const antigas = dados?.antigas ?? [];
  const pagas = linhas.filter((l) => l.pago);
  const emAberto = linhas.filter((l) => !l.pago);
  const soma = (ls: LinhaReembolso[]) => Math.round(ls.reduce((t, l) => t + l.valor, 0) * 100) / 100;
  const situacao = (l: LinhaReembolso) => (l.pago ? `Pago em ${dataBr(l.dataPagamento)}` : "Em aberto");

  function abasExcel(): AbaExcel[] {
    if (!dados) return [];
    const nomeCentro = dados.linhas[0]?.ccuNome;
    const contrato = ccu ? nomeCentro ?? `Centro de custo ${ccu}` : "Centros de custo que você acompanha";
    const periodo = `01/${mes.slice(5)}/${mes.slice(0, 4)} a ${String(ultimoDia(mes)).padStart(2, "0")}/${mes.slice(5)}/${mes.slice(0, 4)}`;
    const origem = (l: LinhaReembolso) => (l.origemTipo === "conta" ? "pela conta" : l.origemTipo === "sugerido" ? "sugerido pelo texto (conferir)" : "não classificado");
    return [
      {
        nome: "Despesas Reembolsáveis",
        observacao: `RELATÓRIO DE DESPESAS REEMBOLSÁVEIS · Contrato: ${contrato} · Período: ${periodo} · Notas do Senior em contas reembolsáveis com VENCIMENTO no mês (pagas ou em aberto), valor = rateio da nota neste centro de custo. Tipo de serviço "sugerido" deve ser conferido. BDI e tributos não calculados.`,
        colunas: [
          { titulo: "DOC.", tipo: "inteiro", largura: 7 }, { titulo: "NOME BENEFICIÁRIO", largura: 20 }, { titulo: "CPF/CNPJ PRESTADOR", largura: 22 }, { titulo: "DATA REALIZAÇÃO", tipo: "data", largura: 16 },
          { titulo: "TIPO DE SERVIÇO", largura: 48 }, { titulo: "VALOR", tipo: "moeda", largura: 16 }, { titulo: "DESCRIÇÃO", largura: 60 },
          { titulo: "Prestador", largura: 36 }, { titulo: "Título", largura: 14 }, { titulo: "Vencimento", tipo: "data", largura: 12 }, { titulo: "Situação", largura: 18 }, { titulo: "Centro de custo", largura: 28 }, { titulo: "Como foi classificado", largura: 26 },
        ],
        linhas: dados.linhas.map((l) => [l.doc, "Grupo Consominas", l.cnpj ?? "", l.dataRealizacao, l.tipo, l.valor, l.descricao, l.fornecedor, l.numTit, l.vencimento, situacao(l), `${l.ccu} - ${l.ccuNome}`, origem(l)]),
        rodape: ["", "", "", "", "TOTAL", dados.resumo.total, "", "", "", "", "", "", ""],
      },
      {
        nome: "Resumo",
        observacao: `RESUMO DAS DESPESAS · ${contrato} · ${periodo}`,
        colunas: [{ titulo: "TIPO DE SERVIÇO", largura: 60 }, { titulo: "LINHAS", tipo: "inteiro", largura: 10 }, { titulo: "VALOR", tipo: "moeda", largura: 18 }],
        linhas: dados.resumo.porTipo.map((p) => [p.tipo, p.linhas, p.valor]),
        rodape: ["Total", dados.resumo.linhas, dados.resumo.total],
      },
      ...[
        { nome: "Parcelas de compras antigas", ls: antigas, observacao: `NOTAS QUE VENCEM EM ${mes.slice(5)}/${mes.slice(0, 4)} MAS FORAM EMITIDAS HÁ MAIS DE ${DIAS_PARCELA_ANTIGA} DIAS · ${contrato} · fora do total da planilha` },
        { nome: "Emitidas no mês, vencem no seguinte", ls: emitidas, observacao: `NOTAS EMITIDAS EM ${mes.slice(5)}/${mes.slice(0, 4)} QUE VENCEM NO MÊS SEGUINTE · ${contrato} · fora do total da planilha` },
      ]
        .filter((g) => g.ls.length > 0)
        .map((g) => ({
          nome: g.nome,
          observacao: g.observacao,
          colunas: [
            { titulo: "NOME BENEFICIÁRIO", largura: 36 }, { titulo: "CPF/CNPJ PRESTADOR", largura: 22 }, { titulo: "DATA REALIZAÇÃO", tipo: "data" as const, largura: 16 }, { titulo: "TIPO DE SERVIÇO", largura: 48 },
            { titulo: "VALOR", tipo: "moeda" as const, largura: 16 }, { titulo: "DESCRIÇÃO", largura: 60 }, { titulo: "Título", largura: 14 }, { titulo: "Vencimento", tipo: "data" as const, largura: 12 }, { titulo: "Situação", largura: 18 }, { titulo: "Centro de custo", largura: 28 },
          ],
          linhas: g.ls.map((l) => [l.fornecedor, l.cnpj ?? "", l.dataRealizacao, l.tipo, l.valor, l.descricao, l.numTit, l.vencimento, situacao(l), `${l.ccu} - ${l.ccuNome}`]),
          rodape: ["", "", "", "TOTAL", soma(g.ls), "", "", "", "", ""],
        })),
    ];
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Despesas reembolsáveis">
      <CabecalhoAba
        titulo="Despesas reembolsáveis"
        descricao={`A planilha de reembolsáveis ${codccu ? "deste centro de custo" : "dos centros de custo que você acompanha"}, montada com as notas do Senior em contas reembolsáveis que vencem no mês, pagas ou em aberto (a regra da planilha da Cristina): prestador, CPF/CNPJ, data, tipo de serviço, valor e descrição, com o resumo por tipo e o Excel no formato dela.`}
        aberta={abaAberta} aoAlternar={() => setAbaAberta((v) => !v)}
        direita={dados ? <p className="text-xs text-gray-400">Senior sincronizado — títulos {hora(dados.atualizadoEm.titulos)} · baixas {hora(dados.atualizadoEm.custo)} · acompanha o Senior sozinho{atualizando ? " · lendo as baixas novas agora…" : ""}</p> : undefined}
      />
      {abaAberta && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => indice > 0 && setMes(meses[indice - 1])} disabled={indice <= 0} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm disabled:opacity-40" aria-label="Mês anterior">‹</button>
              <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium" aria-label="Mês">
                {meses.map((m) => <option key={m} value={m}>{mesLongo(m)}</option>)}
              </select>
              <button type="button" onClick={() => indice < meses.length - 1 && setMes(meses[indice + 1])} disabled={indice >= meses.length - 1} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm disabled:opacity-40" aria-label="Próximo mês">›</button>
            </div>
            {!codccu && (
              <select value={centro} onChange={(e) => setCentro(e.target.value)} className="max-w-[260px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Centro de custo">
                <option value="">Todos os centros de custo</option>
                {(dados?.centros ?? []).map((c) => <option key={c.codccu} value={c.codccu}>{c.codccu} · {c.nome} ({c.n})</option>)}
              </select>
            )}
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="max-w-[300px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Tipo de serviço">
              <option value="">Todos os tipos de serviço</option>
              {TIPOS_DE_SERVICO.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={NAO_CLASSIFICADO}>{NAO_CLASSIFICADO}</option>
            </select>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar prestador, título ou descrição" className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
            <button type="button" onClick={() => { void carregar(); void pedirAtualizacao(); }} disabled={atualizando} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60" title="Lê as baixas novas direto do Senior (leva alguns minutos; a aba se atualiza sozinha quando termina)">{atualizando ? "Lendo o Senior…" : "Atualizar agora"}</button>
            <BotaoExcel arquivo={`reembolsaveis-${mes}${ccu ? `-${ccu}` : ""}`} gerar={abasExcel} desabilitado={!dados} />
          </div>

          {erro && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>}
          {!dados && !erro && <div className="py-8 text-center text-sm text-gray-500">Lendo os reembolsáveis…</div>}

          {dados && resumo && (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2">
                  <span className="block text-xs text-emerald-800">Reembolsável com vencimento em {mesLongo(mes)}</span>
                  <span className="block text-lg font-semibold tabular-nums text-gray-900">{moeda(resumo.total)}</span>
                  <span className="block text-xs text-gray-500">{resumo.linhas} linha{resumo.linhas === 1 ? "" : "s"} · {pagas.length} paga{pagas.length === 1 ? "" : "s"} ({moeda(soma(pagas))}) · {emAberto.length} em aberto ({moeda(soma(emAberto))})</span>
                </div>
                {pendentes > 0 && <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-2"><span className="block text-xs text-sky-900">Lendo a descrição no Senior</span><span className="block text-[15px] font-medium text-gray-800">{pendentes} título{pendentes === 1 ? "" : "s"} · a tela se atualiza sozinha</span></div>}
                {sugeridas > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2"><span className="block text-xs text-amber-900">Tipo de serviço sugerido pelo texto</span><span className="block text-[15px] font-medium text-gray-800">{sugeridas} linha{sugeridas === 1 ? "" : "s"} para conferir</span></div>}
                {naoClass && naoClass.linhas > 0 && <button type="button" onClick={() => setTipo(NAO_CLASSIFICADO)} className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-2 text-left"><span className="block text-xs text-red-800">Sem tipo de serviço</span><span className="block text-[15px] font-medium text-gray-800">{naoClass.linhas} linha{naoClass.linhas === 1 ? "" : "s"} · {moeda(naoClass.valor)}</span></button>}
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[1000px] text-[13px]">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr><th className="px-3 py-2">Doc.</th><th className="px-3 py-2">Prestador</th><th className="px-3 py-2">Data realização</th><th className="px-3 py-2">Tipo de serviço</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Título · situação</th></tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.chave} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 tabular-nums text-gray-500">{l.doc}</td>
                        <td className="px-3 py-2"><div className="font-medium text-gray-800">{l.fornecedor}</div><div className="text-xs text-gray-400">{l.cnpj ?? "sem CPF/CNPJ no título"}</div></td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">{dataBr(l.dataRealizacao) || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={l.origemTipo === "nao_classificado" ? "text-red-700" : "text-gray-700"}>{l.tipo}</span>
                          {l.origemTipo === "sugerido" && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800" title="Sugerido pelo texto da descrição: confira">sugerido</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{moeda(l.valor)}</td>
                        <td className="px-3 py-2 text-gray-600">{l.descricao}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{l.numTit}{l.tipoTitulo ? <span className="ml-1 text-xs text-gray-400">{l.tipoTitulo}</span> : null}<div className={`text-xs ${l.pago ? "text-emerald-700" : "text-amber-700"}`}>{situacao(l)} · vence {dataBr(l.vencimento)}{!codccu ? ` · ${l.ccuNome}` : ""}</div></td>
                      </tr>
                    ))}
                    {linhas.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Nenhuma nota reembolsável vence neste mês com esses filtros.</td></tr>}
                  </tbody>
                  {linhas.length > 0 && <tfoot><tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900"><td className="px-3 py-2" colSpan={4}>Total</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{moeda(resumo.total)}</td><td colSpan={2} /></tr></tfoot>}
                </table>
              </div>

              <div className="mt-4 rounded-xl border border-gray-100 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Resumo das despesas por tipo de serviço</p>
                <table className="w-full max-w-3xl text-[13px]">
                  <tbody>
                    {resumo.porTipo.map((p) => (
                      <tr key={p.tipo} className="border-t border-gray-100 first:border-t-0">
                        <td className="py-1.5 pr-3 text-gray-700">{p.tipo}{p.sugeridas > 0 && <span className="ml-1.5 text-[11px] text-amber-700">({p.sugeridas} sugerida{p.sugeridas === 1 ? "" : "s"})</span>}</td>
                        <td className="w-16 py-1.5 text-right text-xs tabular-nums text-gray-400">{p.linhas} lin.</td>
                        <td className="w-36 py-1.5 text-right tabular-nums text-gray-800">{moeda(p.valor)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 font-semibold text-gray-900"><td className="py-1.5">Total</td><td className="py-1.5 text-right text-xs tabular-nums text-gray-500">{resumo.linhas} lin.</td><td className="py-1.5 text-right tabular-nums">{moeda(resumo.total)}</td></tr>
                  </tbody>
                </table>
              </div>
              {[
                { chave: "antigas", titulo: `Vencem em ${mesLongo(mes)}, mas foram emitidas há mais de ${DIAS_PARCELA_ANTIGA} dias`, ajuda: "parcelas de compras feitas meses antes", ls: antigas },
                { chave: "emitidas", titulo: `Emitidas em ${mesLongo(mes)} e que vencem no mês seguinte`, ajuda: "a Cristina às vezes já lança no mês da emissão", ls: emitidas },
              ].filter((g) => g.ls.length > 0).map((g) => (
                <details key={g.chave} className="mt-4 rounded-xl border border-gray-100 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700">{g.titulo} · {g.ls.length} linha{g.ls.length === 1 ? "" : "s"} · {moeda(soma(g.ls))} <span className="text-xs font-normal text-gray-400">(fora do total acima — {g.ajuda})</span></summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[800px] text-[13px]">
                      <tbody>
                        {g.ls.map((l) => (
                          <tr key={l.chave} className="border-t border-gray-100 align-top">
                            <td className="px-3 py-1.5"><div className="font-medium text-gray-800">{l.fornecedor}</div><div className="text-xs text-gray-400">{l.cnpj ?? "sem CPF/CNPJ no título"}</div></td>
                            <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-700">{dataBr(l.dataRealizacao) || "—"}</td>
                            <td className="px-3 py-1.5 text-gray-700">{l.tipo}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums text-gray-900">{moeda(l.valor)}</td>
                            <td className="px-3 py-1.5 text-gray-600">{l.descricao}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{l.numTit}<div className={`text-xs ${l.pago ? "text-emerald-700" : "text-amber-700"}`}>{situacao(l)} · vence {dataBr(l.vencimento)}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
              <p className="mt-3 text-[13px] text-gray-500">Mesma regra da planilha da Cristina: entram as notas em contas reembolsáveis que vencem no mês (pagas ou ainda em aberto), pelo valor do rateio da nota neste centro de custo. Recibos, notas ainda não lançadas no Senior e a divisão da nota em itens continuam sendo feitos na planilha. As notas emitidas há mais de 90 dias e as que só vencem no mês seguinte aparecem à parte, sem entrar no total. BDI e tributos não são calculados aqui: só se aplicam à parte do Meio Físico, que a Cristina marca.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
