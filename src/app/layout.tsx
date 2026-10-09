import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ResilienciaDeRede from "@/components/ResilienciaDeRede";
import { seniorSimulada } from "@/lib/ambienteHomologacao";

export const metadata: Metadata = {
  title: "Consominas | Gestão de Projetos e Rotinas",
  description: "Ferramenta interna de gestão de projetos, equipes e rotinas da Consominas.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Consominas Gestão",
  },
};

export const viewport: Viewport = {
  themeColor: "#00A99D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {process.env.APP_ENV === "homologacao" && (
          <div className="bg-amber-200 px-4 py-2 text-center text-sm font-bold text-amber-950">
            HOMOLOGAÇÃO LOCAL — dados fictícios. Não enviar arquivos ao banco. {seniorSimulada() ? "Sênior simulada." : "Integração Sênior real: confira o ambiente antes de confirmar baixas."}
          </div>
        )}
        <ServiceWorkerRegister />
        <ResilienciaDeRede />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
