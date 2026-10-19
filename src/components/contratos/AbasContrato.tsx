"use client";

// Abas do contrato alem de Custos (que e' a propria tela de custos por centro de custo, sem alteracao): Visao geral, Custo de pessoal, P0 e Previsao.
// Por decisao do Joao (19/10/2026) estas abas sao ESTRUTURA/BASE: ainda nao recebem dados. Visao geral mostra so' a ficha cadastral e a situacao do acompanhamento.

import Link from "next/link";
import ClientesDoContrato from "./ClientesDoContrato";
import { moeda } from "@/lib/custos/formato";
import type { FichaContrato } from "./FichaEditor";

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

function Cartao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <header className="mb-3"><h2 className="text-base font-semibold text-gray-900">{titulo}</h2>{sub && <p className="mt-0.5 text-[13px] text-gray-500">{sub}</p>}</header>
      {children}
    </section>
  );
}

function Vazio({ titulo, texto, extra }: { titulo: string; texto: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center">
      <p className="text-base font-medium text-gray-700">{titulo}</p>
      <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">{texto}</p>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------- Visao geral (ficha + situacao, sem numeros de custo)
export function AbaVisaoGeral({ ficha, irParaAba }: { ficha: FichaContrato; irParaAba: (a: string) => void }) {
  const fichaCompleta = !!(ficha.cliente && ficha.numero && ficha.vigenciaFim && ficha.valor);
  const itens: [string, boolean | null, string | null][] = [
    ["Custos do Senior (aba Custos)", true, "custos"],
    ["Ficha cadastral (cliente, número, vigência, valor)", fichaCompleta, null],
    ["Custo de pessoal", null, "pessoal"],
    ["Orçamento base (P0)", null, "p0"],
    ["Previsão do Senior por contrato", null, "previsao"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Cartao titulo="Ficha do contrato" sub="Dados cadastrais, preenchidos pelo administrador. Os custos vêm do Senior, na aba Custos.">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
          {([["Cliente", ficha.cliente], ["Número do contrato", ficha.numero], ["Início da vigência", dataBr(ficha.vigenciaInicio)], ["Fim da vigência", dataBr(ficha.vigenciaFim)], ["Valor do contrato", ficha.valor ? moeda(ficha.valor) : null], ["Situação", ficha.status === "ATIVO" ? "Ativo" : "Encerrado"]] as [string, string | null][]).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-gray-400">{k}</dt><dd className="text-gray-800">{v || <span className="text-gray-300">não informado</span>}</dd></div>
          ))}
          {ficha.objeto && <div className="col-span-2"><dt className="text-xs text-gray-400">Objeto</dt><dd className="text-gray-800">{ficha.objeto}</dd></div>}
          {ficha.observacoes && <div className="col-span-2"><dt className="text-xs text-gray-400">Observações</dt><dd className="text-gray-800">{ficha.observacoes}</dd></div>}
        </dl>
      </Cartao>
      <Cartao titulo="Situação do acompanhamento" sub="O que já está ligado a este contrato">
        <ul className="space-y-2.5 text-[14px]">
          {itens.map(([nome, ok, aba]) => (
            <li key={nome} className="flex items-center gap-2.5">
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${ok === true ? "bg-emerald-100 text-emerald-700" : ok === false ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}>{ok === true ? "✓" : ok === false ? "•" : "–"}</span>
              <span className="text-gray-700">{nome}</span>
              <span className="text-xs text-gray-400">{ok === true ? "disponível" : ok === false ? "a preencher" : "em preparação"}</span>
              {aba && <button onClick={() => irParaAba(aba)} className="ml-auto text-[13px] font-medium text-brand hover:text-brand-dark">abrir</button>}
            </li>
          ))}
        </ul>
      </Cartao>
      <ClientesDoContrato codccu={ficha.codccu} />
    </div>
  );
}

// ---------------------------------------------------------------- Custo de pessoal (estrutura)
export function AbaPessoal() {
  return (
    <Cartao titulo="Custo de pessoal" sub="Base para o gestor entender quanto o time do contrato custa e como isso se compara ao resultado">
      <Vazio
        titulo="Esta aba ainda não recebe dados."
        texto="Aqui vai ficar o custo de pessoal do contrato, lido do Senior: equipe alocada, folha e provisões, mês a mês. Os valores só entram depois de validados ao centavo contra o Senior, para que cada número seja claro e rastreável."
      />
    </Cartao>
  );
}

// ---------------------------------------------------------------- P0 (estrutura)
export function AbaP0() {
  const colunas = ["Linha / conta", "Descrição", "Previsto (P0)", "Realizado (Senior)", "Consumo do saldo", "Saldo"];
  return (
    <div className="space-y-5">
      <Cartao titulo="Orçamento base do contrato (P0)" sub="Previsto × realizado × quanto do saldo cada linha já consumiu">
        <Vazio
          titulo="O P0 deste contrato ainda não foi cadastrado."
          texto="Esta aba vai receber o orçamento base de cada contrato, linha a linha, a partir da planilha de P0. O P0 só muda quando há aditivo: cada mudança vira uma nova versão, sem apagar a anterior. O realizado de cada linha vem do Senior."
          extra={<button disabled className="mt-4 cursor-not-allowed rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-400">Cadastrar / importar P0 (aguardando o modelo da planilha)</button>}
        />
      </Cartao>
      <Cartao titulo="Como a aba vai ficar" sub="Estrutura prevista, sem dados">
        <div className="overflow-x-auto rounded-xl border border-gray-100"><table className="w-full text-[13.5px]"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr>{colunas.map((c, i) => <th key={c} className={`px-3 py-2 ${i >= 2 ? "text-right" : ""}`}>{c}</th>)}</tr></thead><tbody><tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-gray-300">As linhas do P0 aparecerão aqui.</td></tr></tbody></table></div>
      </Cartao>
    </div>
  );
}

// ---------------------------------------------------------------- Previsao (estrutura + atalhos para as telas que ja existem)
export function AbaPrevisao({ codccu }: { codccu: string }) {
  const itens = [
    { t: "Despesas recorrentes", d: "Custos fixos e recorrentes, inclusive os de valor variável, lidos do Senior.", href: "/despesas-recorrentes" },
    { t: "Programação de pagamento", d: "Títulos em aberto e parcelas a vencer, com a ordem de compra de origem.", href: "/programacao-pagamento" },
    { t: "Alertas do financeiro", d: "Avisos de vencimento e títulos que merecem atenção.", href: "/alertas-financeiro" },
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13.5px] text-sky-900">
        A previsão vem do Senior e já existe nas telas abaixo, para toda a empresa. A visão deste contrato (CCU {codccu}) ainda não está aqui. A previsão fica separada do realizado: a aba Custos mostra só o que já foi pago.
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {itens.map((i) => (
          <Link key={i.href} href={i.href} className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-soft transition hover:border-brand/40 hover:shadow-md">
            <h3 className="text-base font-semibold text-gray-900">{i.t}</h3>
            <p className="mt-1 text-[13.5px] text-gray-500">{i.d}</p>
            <span className="mt-3 inline-block text-[13px] font-medium text-brand">Abrir →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
