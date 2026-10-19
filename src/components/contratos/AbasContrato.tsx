"use client";

// Abas do contrato alem de Custos (que e' a propria tela de custos por centro de custo, sem alteracao): Visao geral, Custo de pessoal, P0 e Previsao.
// Por decisao do Joao (19/10/2026): Custo de pessoal e P0 sao ESTRUTURA/BASE (ainda sem dados; o P0 so' sera feito depois que todos os contratos tiverem o seu).
// Previsao ja le o Senior (titulos em aberto por centro de custo), somente leitura. Visao geral mostra so' a ficha cadastral e a situacao do acompanhamento.

import ClientesDoContrato from "./ClientesDoContrato";
import PrevisaoMensal from "./PrevisaoMensal";
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
    ["Previsão do Senior por contrato (títulos em aberto)", true, "previsao"],
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

// ---------------------------------------------------------------- P0 (estrutura, sem cadastro por enquanto)
const PARTES_P0 = [
  { t: "Receita", d: "As linhas das medições do contrato: o que se espera faturar, mês a mês." },
  { t: "Custos", d: "As previsões lineares de custo, mês a mês. Cada previsão vira uma linha no gráfico principal do contrato." },
  { t: "Desvio", d: "A diferença entre o previsto (P0) e o realizado do Senior. É onde os coordenadores vão justificar o desvio." },
];

export function PartesDoP0() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {PARTES_P0.map((x) => (
        <div key={x.t} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <h3 className="text-[14px] font-semibold text-gray-900">{x.t}</h3>
          <p className="mt-1 text-[13.5px] text-gray-600">{x.d}</p>
        </div>
      ))}
    </div>
  );
}

export function AbaP0() {
  return (
    <div className="space-y-5">
      <Cartao titulo="P0 do contrato" sub="Aba preparada. O cadastro só começa depois que todos os contratos tiverem o seu P0 definido.">
        <Vazio
          titulo="O P0 deste contrato ainda não foi cadastrado."
          texto="Quando o P0 de cada contrato estiver pronto, ele será cadastrado aqui. Nada é estimado nem preenchido automaticamente: o previsto vem do P0 e o realizado vem do Senior."
        />
      </Cartao>
      <Cartao titulo="Como o P0 vai funcionar" sub="Para o gestor entender o que virá nesta aba">
        <PartesDoP0 />
      </Cartao>
    </div>
  );
}

// ---------------------------------------------------------------- Previsao (titulos em aberto do Senior por centro de custo)
export function AbaPrevisao({ codccu }: { codccu: string }) {
  return <PrevisaoMensal ccuFixo={codccu} />;
}
