"use client";

import { Suspense } from "react";
import CustoPessoalView from "@/components/custoPessoal/CustoPessoalView";

export default function CustoPessoalPage() {
  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <Suspense fallback={<div className="text-sm text-gray-500">Carregando...</div>}>
        <CustoPessoalView />
      </Suspense>
    </div>
  );
}
