// Lado da TELA do "Atualizar agora" (12/11/2026): comeca a busca na Senior e acompanha ate ela terminar de verdade, em vez de
// esperar um tempo fixo e anunciar "lista atualizada" sem saber se algo chegou. So' fetch -- roda no navegador.

export type FonteSync = "titulos" | "ocs";

export type EstadoFonteSync = {
  fonte: FonteSync;
  emAndamento: boolean;
  etapa: string | null;
  modo: "rapida" | "completa" | null;
  iniciadaEm: string | null;
  sucessoEm: string | null;
  modoConcluido: string | null;
  ultimaCompletaEm: string | null;
  quantidade: number | null;
  removidos: number | null;
  aviso: string | null;
  falhaEm: string | null;
  falha: string | null;
  interrompida: boolean;
};

const ROTA_PADRAO: Record<FonteSync, string> = {
  titulos: "/api/senior/titulos-pagar/sincronizar-agora",
  ocs: "/api/senior/aprovacoes/sincronizar-agora",
};
const NOME: Record<FonteSync, string> = { titulos: "títulos", ocs: "OCs" };
const numero = (n: number) => n.toLocaleString("pt-BR");
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const duracao = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

export async function lerEstadoSync(): Promise<EstadoFonteSync[]> {
  const r = await fetch("/api/senior/sincronizacao", { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Não foi possível ler o andamento da busca (HTTP ${r.status})`);
  return d.fontes ?? [];
}

export type ResultadoSync = { ok: boolean; parcial: boolean; texto: string };

/**
 * Comeca a busca das fontes e acompanha ate cada uma terminar (sucesso ou falha DEPOIS do clique). `aoMudar` recebe o
 * andamento ("títulos: lendo títulos pagos (7/23) · 1 min 20 s"). `rotas` troca a rota de inicio (ex.: a do Pagamentos Itau).
 */
export async function sincronizarEAcompanhar(
  fontes: FonteSync[],
  aoMudar: (texto: string) => void,
  opcoes: { rotas?: Partial<Record<FonteSync, string>>; sinal?: AbortSignal; limiteMs?: number } = {}
): Promise<ResultadoSync> {
  const inicio = Date.now();
  const limiteMs = opcoes.limiteMs ?? 20 * 60_000;
  const pendentes = new Map<FonteSync, number>(); // fonte -> inicio da busca acompanhada (ms)
  const finais = new Map<FonteSync, { ok: boolean; texto: string }>();

  aoMudar(`Pedindo à Senior os dados de ${fontes.map((f) => NOME[f]).join(" e ")}…`);
  await Promise.all(
    fontes.map(async (fonte) => {
      try {
        const r = await fetch(opcoes.rotas?.[fonte] ?? ROTA_PADRAO[fonte], { method: "POST", signal: opcoes.sinal });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        pendentes.set(fonte, new Date(d.iniciadaEm).getTime());
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        finais.set(fonte, { ok: false, texto: `${NOME[fonte]}: não foi possível começar a busca (${(e as Error).message})` });
      }
    })
  );

  while (pendentes.size) {
    if (Date.now() - inicio > limiteMs) {
      for (const fonte of pendentes.keys()) finais.set(fonte, { ok: false, texto: `${NOME[fonte]}: a busca ainda está rodando no servidor; a lista atualiza quando ela terminar` });
      break;
    }
    await new Promise<void>((resolver, rejeitar) => {
      const t = setTimeout(resolver, 3000);
      opcoes.sinal?.addEventListener("abort", () => (clearTimeout(t), rejeitar(new DOMException("cancelado", "AbortError"))), { once: true });
    });
    let estados: EstadoFonteSync[];
    try {
      estados = await lerEstadoSync();
    } catch {
      continue; // oscilacao de rede: tenta de novo no proximo ciclo
    }
    const andamento: string[] = [];
    for (const [fonte, desde] of pendentes) {
      const e = estados.find((x) => x.fonte === fonte);
      if (!e) continue;
      const sucesso = e.sucessoEm ? new Date(e.sucessoEm).getTime() : 0;
      const falha = e.falhaEm ? new Date(e.falhaEm).getTime() : 0;
      if (!e.emAndamento && sucesso >= desde) {
        const removidos = e.removidos ? `, ${numero(e.removidos)} removidos` : "";
        const tipo = fonte === "titulos" ? (e.modoConcluido === "completa" ? " (histórico completo)" : " em aberto ou alterados") : "";
        finais.set(fonte, { ok: true, texto: `${numero(e.quantidade ?? 0)} ${NOME[fonte]}${tipo}${removidos}${e.aviso ? ` (${e.aviso})` : ""}` });
        pendentes.delete(fonte);
      } else if (!e.emAndamento && falha >= desde) {
        finais.set(fonte, { ok: false, texto: `${NOME[fonte]}: ${e.falha ?? "falhou"}` });
        pendentes.delete(fonte);
      } else if (!e.emAndamento && e.interrompida) {
        finais.set(fonte, { ok: false, texto: `${NOME[fonte]}: a busca foi interrompida (o sistema reiniciou); tente de novo` });
        pendentes.delete(fonte);
      } else {
        const completa = e.modo === "completa" ? " — busca completa do histórico, leva uns 15 min" : "";
        andamento.push(`${NOME[fonte]}: ${e.etapa ?? "na fila"}${completa}`);
      }
    }
    if (pendentes.size) aoMudar(`Buscando na Senior — ${andamento.join(" · ")} · ${duracao(Date.now() - inicio)}`);
  }

  const lista = fontes.map((f) => finais.get(f)).filter((x): x is { ok: boolean; texto: string } => !!x);
  const ok = lista.every((r) => r.ok);
  const parcial = !ok && lista.some((r) => r.ok);
  const okTextos = lista.filter((r) => r.ok).map((r) => r.texto);
  const falhas = lista.filter((r) => !r.ok).map((r) => r.texto);
  const texto = [
    okTextos.length ? `Atualizado da Senior às ${hora(new Date().toISOString())}: ${okTextos.join("; ")}.` : "",
    falhas.length ? `Não atualizou — ${falhas.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { ok, parcial, texto };
}
