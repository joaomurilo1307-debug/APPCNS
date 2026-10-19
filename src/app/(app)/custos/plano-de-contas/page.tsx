"use client";

import { Suspense } from "react";
import CustoPorContratoView from "@/components/custos/CustoPorContratoView";

export default function CustoPlanoDeContasPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
      <CustoPorContratoView />
    </Suspense>
  );
}
