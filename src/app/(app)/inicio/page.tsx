import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { IconFolders, IconBarChart } from "@/components/NavIcons";

// Tela inicial: escolhe o modulo. Os papeis de cada cartao seguem os do menu (Sidebar.tsx).
const MODULOS = [
  {
    href: "/dashboard",
    titulo: "Projetos e Gestão",
    descricao: "Projetos, tarefas, sprint, Gantt, calendário, metas, PDI e relatórios.",
    icon: IconFolders,
    roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"],
  },
  {
    href: "/programacao-pagamento",
    titulo: "Financeiro",
    descricao: "Aprovações de OC, conferência de OC, programação de pagamento, SISPAG e custos.",
    icon: IconBarChart,
    roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"],
  },
];

export default async function InicioPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const modulos = MODULOS.filter((m) => m.roles.includes(user?.role));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Olá, {user?.name?.split(" ")[0]}</h1>
      <p className="mb-8 text-sm text-gray-500">Escolha o módulo que deseja acessar.</p>
      <div className="grid gap-6 sm:grid-cols-2">
        {modulos.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className="glass shadow-soft group flex flex-col gap-3 rounded-2xl border border-white/60 p-6 transition-all hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white">
                <Icon className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold text-gray-800 group-hover:text-brand-dark">{m.titulo}</span>
              <span className="text-sm text-gray-500">{m.descricao}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
