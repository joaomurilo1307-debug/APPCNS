export function seniorSimulada(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SENIOR_WS_SAPIENS_URL === "http://127.0.0.1:3099/leitura" && env.SENIOR_WS_BAIXA_URL === "http://127.0.0.1:3099/baixa";
}

export function homologacaoLocalSegura(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_ENV !== "homologacao" || !seniorSimulada(env)) return false;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/consominas_gestao_itau_homologacao";
  } catch { return false; }
}
