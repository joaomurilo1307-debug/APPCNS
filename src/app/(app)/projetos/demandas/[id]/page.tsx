import DemandaDetalhe from "@/components/demandas/DemandaDetalhe";

export default function DemandaPage({ params }: { params: { id: string } }) {
  return <DemandaDetalhe id={params.id} base="/projetos/demandas" modo="gestor" />;
}
