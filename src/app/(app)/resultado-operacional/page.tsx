"use client";

import { Suspense } from "react";
import ResultadoOperacionalView from "@/components/resultado/ResultadoOperacionalView";

export default function ResultadoOperacionalPage() {
  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Carregando...</div>}>
        <ResultadoOperacionalView />
      </Suspense>
    </div>
  );
}
