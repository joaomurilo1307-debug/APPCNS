"use client";

// Nucleo > Inventario de equipamentos e licencas: le as respostas do formulario publico (hospedado no n8n) e exporta tudo compilado em Excel.
// So' leitura; quem preenche e' o formulario, ninguem edita nada por aqui.

import { useEffect, useMemo, useState } from "react";
import BotaoExcel from "@/components/BotaoExcel";

type Maquina = { sistema?: string; marca?: string; modelo?: string; patrimonio?: string };
type Licenca = { nome?: string; validade?: string };
type Submissao = {
  id: string;
  nome: string;
  email: string;
  cidade: string;
  contratos: string[];
  maquinas: Maquina[];
  temLicenca: boolean;
  licencas: Licenca[];
  criadoEm: string;
};

const dataHoraBr = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function InventarioPage() {
  const [respostas, setRespostas] = useState<Submissao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/inventario/listar", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return setErro(j.error || "Não foi possível carregar as respostas.");
        setRespostas(j.respostas as Submissao[]);
      })
      .catch(() => setErro("Não foi possível carregar as respostas."));
  }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (respostas ?? []).filter((r) => !q || r.nome.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.cidade.toLowerCase().includes(q) || r.contratos.some((c) => c.toLowerCase().includes(q)));
  }, [respostas, busca]);

  const maxMaquinas = Math.max(1, ...filtradas.map((r) => r.maquinas.length));

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Inventário de equipamentos e licenças</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">Respostas do formulário de inventário, mais recente primeiro. Preenchido pelos colaboradores; aqui só se vê e exporta.</p>
      </header>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Respostas</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">{respostas ? `${respostas.length} ${respostas.length === 1 ? "resposta" : "respostas"}.` : "Carregando…"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail, cidade ou contrato" className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
            <BotaoExcel
              arquivo="inventario-equipamentos-licencas"
              desabilitado={!filtradas.length}
              gerar={() => {
                const colunas = [
                  { titulo: "Data de envio", largura: 18 },
                  { titulo: "Nome", largura: 26 },
                  { titulo: "E-mail", largura: 26 },
                  { titulo: "Cidade", largura: 18 },
                  { titulo: "Contrato(s) / Centro(s) de Custo", largura: 36 },
                  ...Array.from({ length: maxMaquinas }, (_, i) => [
                    { titulo: `Máquina ${i + 1} - Sistema`, largura: 18 },
                    { titulo: `Máquina ${i + 1} - Marca`, largura: 16 },
                    { titulo: `Máquina ${i + 1} - Modelo`, largura: 18 },
                    { titulo: `Máquina ${i + 1} - Patrimônio`, largura: 16 },
                  ]).flat(),
                  { titulo: "Usa licença específica", largura: 14 },
                  { titulo: "Licença(s)", largura: 30 },
                  { titulo: "Validade(s)", largura: 24 },
                ];
                const linhas = filtradas.map((r) => [
                  dataHoraBr(r.criadoEm),
                  r.nome,
                  r.email,
                  r.cidade,
                  r.contratos.join("; "),
                  ...Array.from({ length: maxMaquinas }, (_, i) => [r.maquinas[i]?.sistema ?? "", r.maquinas[i]?.marca ?? "", r.maquinas[i]?.modelo ?? "", r.maquinas[i]?.patrimonio ?? ""]).flat(),
                  r.temLicenca ? "Sim" : "Não",
                  r.licencas.map((l) => l.nome).filter(Boolean).join("; "),
                  r.licencas.map((l) => l.validade).filter(Boolean).join("; "),
                ]);
                return [{ nome: "Inventário", observacao: "Respostas do formulário de inventário de equipamentos e licenças, compiladas", colunas, linhas }];
              }}
            />
          </div>
        </header>
        {erro ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>
        ) : !respostas ? (
          <p className="py-6 text-center text-sm text-gray-500">Carregando respostas…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[900px] text-[13.5px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Enviado em</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">E-mail</th>
                  <th className="px-3 py-2">Cidade</th>
                  <th className="px-3 py-2">Contrato/CC</th>
                  <th className="px-3 py-2">Máquinas</th>
                  <th className="px-3 py-2">Licenças</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{dataHoraBr(r.criadoEm)}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{r.nome}</td>
                    <td className="px-3 py-2 text-gray-600">{r.email}</td>
                    <td className="px-3 py-2 text-gray-600">{r.cidade}</td>
                    <td className="px-3 py-2 text-gray-600">{r.contratos.join(", ")}</td>
                    <td className="px-3 py-2 text-gray-600">{r.maquinas.length}</td>
                    <td className="px-3 py-2 text-gray-600">{r.temLicenca ? r.licencas.map((l) => l.nome).filter(Boolean).join(", ") || "Sim" : "Não"}</td>
                  </tr>
                ))}
                {filtradas.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Nenhuma resposta encontrada.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
