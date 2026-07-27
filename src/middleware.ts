export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/equipes/:path*", "/projetos/:path*", "/tarefas/:path*"],
};
