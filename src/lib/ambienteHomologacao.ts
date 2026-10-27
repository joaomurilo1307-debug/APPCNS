export function seniorSimulada(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SENIOR_WS_SAPIENS_URL === "http://127.0.0.1:3099/leitura" && env.SENIOR_WS_BAIXA_URL === "http://127.0.0.1:3099/baixa";
}

export function homologacaoLocalSegura(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_ENV !== "homologacao" || !seniorSimulada(env)) return false;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const bancoLegado = url.pathname === "/consominas_gestao_itau_homologacao";
    const bancoMetas = url.pathname === "/consominas_metas_homologacao" && url.port === "55439";
    return ["localhost", "127.0.0.1"].includes(url.hostname) && (bancoLegado || bancoMetas);
  } catch { return false; }
}
