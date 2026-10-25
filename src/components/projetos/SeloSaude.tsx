// Semaforo de saude do projeto (regra em src/lib/projetos/saude.ts). Passe o mouse para ver os motivos.
import { COR_SAUDE, PONTO_SAUDE, type NivelSaude } from "@/lib/projetos/saude";

export type SaudeDoProjeto = { nivel: NivelSaude; rotulo: string; motivos: string[] };

export default function SeloSaude({ saude, className = "" }: { saude?: SaudeDoProjeto | null; className?: string }) {
  if (!saude) return null;
  return (
    <span title={saude.motivos.join(" · ")} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_SAUDE[saude.nivel]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${PONTO_SAUDE[saude.nivel]}`} aria-hidden="true" />
      {saude.rotulo}
    </span>
  );
}
