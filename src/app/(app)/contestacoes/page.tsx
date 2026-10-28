"use client";

import { Suspense } from "react";
import TelaContestacoes from "@/components/contestacoes/TelaContestacoes";

export default function ContestacoesPage() {
  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Carregando...</div>}>
        <TelaContestacoes />
      </Suspense>
    </div>
  );
}
