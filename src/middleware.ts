export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/equipes/:path*",
    "/projetos/:path*",
    "/tarefas/:path*",
    "/sprint/:path*",
    "/gantt/:path*",
    "/calendario/:path*",
    "/usuarios/:path*",
    "/aprovacoes/:path*",
    "/portal-cliente/:path*",
  ],
};
