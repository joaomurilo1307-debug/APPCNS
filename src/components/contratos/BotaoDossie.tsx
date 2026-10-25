"use client";

// "Dossiê (Excel)": uma planilha com tudo do contrato (Resumo, custo por conta x mes, lancamentos Rel114, medicao por linha, previsao e equipe).
// Busca cada parte pelas mesmas APIs das telas; o que a pessoa nao pode ver ou o contrato nao tem fica de fora e o Resumo avisa.
import BotaoExcel from "@/components/BotaoExcel";
import { montarDossie, type Buscar } from "@/lib/contratos/dossie";
import type { FichaContrato } from "./FichaEditor";

const buscar: Buscar = async (url) => {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

export default function BotaoDossie({ ficha }: { ficha: FichaContrato }) {
  const slug = ficha.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
  return (
    <BotaoExcel
      arquivo={`dossie-contrato-${ficha.codccu}-${slug}`}
      rotulo="Dossiê (Excel)"
      gerar={() => montarDossie(ficha, buscar)}
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
    />
  );
}
