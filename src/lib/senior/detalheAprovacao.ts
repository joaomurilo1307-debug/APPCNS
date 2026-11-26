// Detalhe de aprovacao de UMA OC para a tela /aprovacoes/oc: niveis exigidos (1 Coordenacao, 2 Gerencia, 3 Diretoria), quais ja
// aprovaram e quem pode aprovar cada um, mais o vencimento (E420OCP.USU_DATVECT, mesmo campo da previsao de pagamento).
// So' LEITURA (GetDBInfo): reaproveita lerAprovacaoOc.

import { consultarSenior } from "./getDbInfo";
import { COD_EMP, dataIso } from "./ocsConferencia";
import { lerAprovacaoOc, type AprovacaoOc } from "./aprovacaoOc";

export const ROTULO_NIVEL: Record<number, string> = { 1: "Coordenação", 2: "Gerência", 3: "Diretoria" };
export const rotuloNivel = (n: number) => `${n} - ${ROTULO_NIVEL[n] ?? `Nível ${n}`}`;

export type NivelDetalhe = { nivel: number; rotulo: string; status: "aprovado" | "pendente"; aprovadoPor: string | null; aprovadoEm: string | null; podemAprovar: string[] };
export type DetalheAprovacao = { vencimento: string | null; niveis: NivelDetalhe[]; niveisInformados: boolean; reprovada: boolean };

export function montarNiveis(a: Pick<AprovacaoOc, "niveisExigidos" | "niveisAprovados" | "eventos" | "ccus">): NivelDetalhe[] {
  return a.niveisExigidos.map((nivel) => {
    const ev = a.eventos.find((e) => e.situacao === "APR" && e.nivel === nivel);
    const quem = new Set<string>();
    for (const c of a.ccus) for (const g of c.aprovadoresCadastrados) if (g.nivel === nivel) g.pessoas.forEach((p) => quem.add(p.nome));
    return {
      nivel,
      rotulo: rotuloNivel(nivel),
      status: a.niveisAprovados.includes(nivel) ? "aprovado" : "pendente",
      aprovadoPor: ev?.por.nome ?? null,
      aprovadoEm: ev?.data ?? null,
      podemAprovar: [...quem],
    };
  });
}

export async function detalheAprovacao(numero: number, filial: number): Promise<DetalheAprovacao> {
  const [aprovacao, venc] = await Promise.all([
    lerAprovacaoOc(String(numero), String(filial)),
    consultarSenior(`SELECT USU_DATVECT FROM E420OCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${filial} AND NUMOCP = ${numero}`),
  ]);
  return {
    vencimento: dataIso(venc[0]?.USU_DATVECT),
    niveis: aprovacao ? montarNiveis(aprovacao) : [],
    niveisInformados: !!aprovacao && aprovacao.niveisExigidos.length > 0,
    reprovada: !!aprovacao?.reprovada,
  };
}
