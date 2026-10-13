// Regras puras do controle de veiculos: onde cada veiculo esta (contrato/projeto, equipe, local)
// e o historico por periodo. Datas "AAAA-MM-DD". Nada aqui acessa banco.

import { diferencaDias, somarDias, type Dia } from "./disponibilidade";

export const STATUS_VEICULO = ["Em operação", "Disponível", "Em manutenção", "Parado", "Devolvido"] as const;

export type MovimentoBase = {
  id: string;
  veiculoId: string;
  inicio: Dia;
  fim: Dia | null; // null = continua la
  projeto: string;
  equipeId: string | null;
  campanhaId: string | null;
  local: string | null;
};

const ATE_O_FIM = "9999-12-31";
const fimDe = (m: Pick<MovimentoBase, "fim">) => m.fim ?? ATE_O_FIM;

/** Onde o veiculo esta no dia (null = sem localizacao registrada). */
export function localizacaoNoDia(movs: MovimentoBase[], dia: Dia): MovimentoBase | null {
  const daqui = movs.filter((m) => m.inicio <= dia && fimDe(m) >= dia).sort((a, b) => b.inicio.localeCompare(a.inicio));
  return daqui[0] ?? null;
}

/** Proxima mudanca prevista depois do dia (movimento que comeca depois). */
export function proximoMovimento(movs: MovimentoBase[], dia: Dia): MovimentoBase | null {
  return movs.filter((m) => m.inicio > dia).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null;
}

export type PlanoMovimento =
  | { ok: true; fecharAnterior: { id: string; fim: Dia } | null; fimNovo: Dia | null }
  | { ok: false; erro: string };

/**
 * Planeja registrar que o veiculo passa a estar em outro lugar a partir de `inicio`.
 * - a passagem aberta (sem fim) que comecou antes e fechada no dia anterior, sem apagar nada;
 * - se ja ha passagem futura, a nova termina no dia anterior a ela;
 * - recusa quando o novo periodo cai dentro de uma passagem que ja tem inicio e fim.
 */
export function planejarMovimento(movs: MovimentoBase[], novo: { inicio: Dia; fim: Dia | null }): PlanoMovimento {
  if (novo.fim && novo.fim < novo.inicio) return { ok: false, erro: "O fim não pode ser antes do início" };
  const anteriorAberta = movs.find((m) => m.fim === null && m.inicio < novo.inicio) ?? null;
  const fimSolicitado = novo.fim ?? ATE_O_FIM;
  for (const m of movs) {
    if (anteriorAberta && m.id === anteriorAberta.id) continue; // essa sera fechada, nao e conflito
    if (!(m.inicio <= fimSolicitado && fimDe(m) >= novo.inicio)) continue;
    if (novo.fim === null && m.inicio > novo.inicio) continue; // passagem futura: a nova so termina antes dela
    return { ok: false, erro: `Já existe uma passagem registrada de ${m.inicio} a ${m.fim ?? "sem fim"} que se sobrepõe a este período` };
  }
  let fimNovo = novo.fim;
  if (fimNovo === null) {
    const proxima = movs.filter((m) => m.inicio > novo.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    if (proxima) fimNovo = somarDias(proxima.inicio, -1);
  }
  return { ok: true, fecharAnterior: anteriorAberta ? { id: anteriorAberta.id, fim: somarDias(novo.inicio, -1) } : null, fimNovo };
}

export type VeiculoBase = { id: string; codigo: string; identificacao: string; placa: string | null; status: string };

export type ResumoContratoVeiculos = { projeto: string; total: number; porStatus: Record<string, number> };

/** Quantos veiculos em cada contrato/projeto no dia; "Sem localização" para os sem registro. */
export function resumoPorContrato(veiculos: VeiculoBase[], movimentos: MovimentoBase[], dia: Dia): ResumoContratoVeiculos[] {
  const porVeiculo = new Map<string, MovimentoBase[]>();
  for (const m of movimentos) {
    if (!porVeiculo.has(m.veiculoId)) porVeiculo.set(m.veiculoId, []);
    porVeiculo.get(m.veiculoId)!.push(m);
  }
  const mapa = new Map<string, ResumoContratoVeiculos>();
  for (const v of veiculos) {
    const loc = localizacaoNoDia(porVeiculo.get(v.id) ?? [], dia);
    const projeto = loc?.projeto ?? "Sem localização";
    if (!mapa.has(projeto)) mapa.set(projeto, { projeto, total: 0, porStatus: {} });
    const r = mapa.get(projeto)!;
    r.total++;
    r.porStatus[v.status] = (r.porStatus[v.status] ?? 0) + 1;
  }
  return [...mapa.values()].sort((a, b) => (a.projeto === "Sem localização" ? 1 : b.projeto === "Sem localização" ? -1 : a.projeto.localeCompare(b.projeto)));
}

/** Dias que o veiculo esta (ou esta previsto) no lugar atual, a partir do inicio da passagem. */
export function diasNoLocal(m: MovimentoBase, hoje: Dia): number {
  return Math.max(0, diferencaDias(m.inicio, hoje) + 1);
}
