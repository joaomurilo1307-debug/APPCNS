import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { bloqueiaEscrita } from "@/lib/acesso/somenteLeitura";

const paginas = withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any;
    const path = req.nextUrl.pathname;

    if (token?.primeiroAcesso && path !== "/completar-cadastro") {
      return NextResponse.redirect(new URL("/completar-cadastro", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export default async function middleware(req: NextRequest, evento: any) {
  // API: nao redireciona ninguem (as rotas respondem 401 sozinhas, e as de sincronismo usam chave propria). So' barra a escrita de quem e' somente leitura.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const token = await getToken({ req });
    if (token && bloqueiaEscrita(token.role as string | undefined, req.method, req.nextUrl.pathname)) {
      return NextResponse.json({ error: "Seu acesso é somente de consulta fora de Projetos: o Acesso Master só edita a parte de Projetos." }, { status: 403 });
    }
    return NextResponse.next();
  }
  return (paginas as any)(req, evento);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/equipes/:path*",
    "/projetos/:path*",
    "/tarefas/:path*",
    "/sprint/:path*",
    "/gantt/:path*",
    "/calendario/:path*",
    "/chat/:path*",
    "/usuarios/:path*",
    "/aprovacoes/:path*",
    "/inicio",
    "/portal-cliente/:path*",
    "/completar-cadastro",
    "/api/:path*",
  ],
};
