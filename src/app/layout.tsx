import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

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
        <ServiceWorkerRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
