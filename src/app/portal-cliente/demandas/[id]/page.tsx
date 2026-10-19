import DemandaDetalhe from "@/components/demandas/DemandaDetalhe";

export default function DemandaClientePage({ params }: { params: { id: string } }) {
  return <DemandaDetalhe id={params.id} base="/portal-cliente/demandas" modo="cliente" />;
}
