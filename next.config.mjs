/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.APP_ENV === "homologacao" ? ".next-homologacao" : ".next",
  // Next 14 exige o opt-in para src/instrumentation.ts (agendador do Custo por Contrato; ver src/lib/custos/agendador.ts).
  experimental: { instrumentationHook: true },
  // Cabecalhos de seguranca em todas as respostas (nomes e valores da doc oficial do Next 14, "headers").
  // Content-Security-Policy ficou de fora de proposito: exige mapear os scripts/estilos inline do app antes de ligar.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // O app nao usa camera, microfone nem geolocalizacao (reuniao abre o Jitsi em outra aba).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Producao so' responde em HTTPS (Traefik redireciona). Sem "preload" e sem "includeSubDomains" de proposito.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
