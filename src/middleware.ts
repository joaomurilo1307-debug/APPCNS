import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
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
    "/portal-cliente/:path*",
    "/completar-cadastro",
  ],
};
