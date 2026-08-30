"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Colaborador = {
  id: string;
  nomeCompleto: string;
  funcao: string;
  situacao: string;
  tamanhoBota: number | null;
  tamanhoCamisa: string | null;
  tamanhoCalca: number | null;
  cpf: string | null;
  rg: string | null;
  moradia: string | null;
  endereco: string | null;
  contrato: { id: string; codigo: string; nome: string | null };
};

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  function reload() {
    const qs = busca ? `?q=${encodeURIComponent(busca)}` : "";
    fetch(`/api/epi/colaboradores${qs}`).then((r) => r.json()).then(setColaboradores).catch(() => {});
  }

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const porContrato = useMemo(() => {
    const map = new Map<string, { codigo: string; nome: string | null; itens: Colaborador[] }>();
    for (const c of colaboradores) {
      const key = c.contrato.id;
      if (!map.has(key)) map.set(key, { codigo: c.contrato.codigo, nome: c.contrato.nome, itens: [] });
      map.get(key)!.itens.push(c);
    }
    return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [colaboradores]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou função..."
          className="w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">{colaboradores.length} colaboradores</span>
      </div>

      <div className="space-y-6">
        {porContrato.map((grupo) => (
          <div key={grupo.codigo} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Contrato {grupo.codigo} {grupo.nome ? `— ${grupo.nome}` : ""}
              </h2>
              <span className="text-xs text-gray-400">{grupo.itens.length} pessoas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-2">Nome</th>
                    <th className="px-5 py-2">Função</th>
                    <th className="px-5 py-2">Situação</th>
                    <th className="px-5 py-2">Bota</th>
                    <th className="px-5 py-2">Camisa</th>
                    <th className="px-5 py-2">Calça</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {grupo.itens.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="border-t border-gray-50 hover:bg-gray-50/60">
                        <td className="px-5 py-2 font-medium text-gray-700">{c.nomeCompleto}</td>
                        <td className="px-5 py-2 text-gray-500">{c.funcao}</td>
                        <td className="px-5 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.situacao === "ATIVO" ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {c.situacao}
                          </span>
                        </td>
                        <td className="px-5 py-2 text-gray-500">{c.tamanhoBota ?? "—"}</td>
                        <td className="px-5 py-2 text-gray-500">{c.tamanhoCamisa ?? "—"}</td>
                        <td className="px-5 py-2 text-gray-500">{c.tamanhoCalca ?? "—"}</td>
                        <td className="px-5 py-2 text-right">
                          <button
                            onClick={() => setAberto(aberto === c.id ? null : c.id)}
                            className="text-xs font-medium text-brand-dark hover:underline"
                          >
                            {aberto === c.id ? "Fechar" : "Detalhes"}
                          </button>
                        </td>
                      </tr>
                      {aberto === c.id && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-5 py-3 text-xs text-gray-500">
                            <span className="mr-4">CPF: {c.cpf ?? "—"}</span>
                            <span className="mr-4">RG: {c.rg ?? "—"}</span>
                            <span className="mr-4">Moradia: {c.moradia ?? "—"}</span>
                            <span>Endereço: {c.endereco ?? "—"}</span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {porContrato.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum colaborador cadastrado ainda — importe uma planilha em "Importar planilha".</p>
        )}
      </div>
    </div>
  );
}
