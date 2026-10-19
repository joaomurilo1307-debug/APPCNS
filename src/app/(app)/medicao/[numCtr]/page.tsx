"use client";

import { useParams } from "next/navigation";
import MedicaoDetalhe from "@/components/medicao/MedicaoDetalhe";

export default function MedicaoContratoPage() {
  const params = useParams<{ numCtr: string }>();
  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <MedicaoDetalhe numCtr={params.numCtr} />
    </div>
  );
}
