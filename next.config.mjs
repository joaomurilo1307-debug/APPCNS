/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.APP_ENV === "homologacao" ? ".next-homologacao" : ".next",
  // Next 14 exige o opt-in para src/instrumentation.ts (agendador do Custo por Contrato; ver src/lib/custos/agendador.ts).
  experimental: { instrumentationHook: true },
};

export default nextConfig;
