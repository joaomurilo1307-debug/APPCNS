import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consultarSenior, emFilaSenior } from "@/lib/senior/getDbInfo";

// Tela Usuarios > Acesso: "Puxar do Senior onde ele aprova". Devolve os centros de custo em que o(s) login(s) do Senior estao na alcada ATIVA
// de aprovacao de OC (E068CNA, rotina 12), nos niveis pedidos: 1 = coordenacao, 2 = gerencia, 3 = diretoria (padrao: 1 e 2). So' leitura do Senior;
// o admin confere e grava no painel.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Só administradores" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const codigos = Array.from(new Set((params.get("codigos") ?? "").split(",").map((c) => c.trim()).filter((c) => /^\d{1,6}$/.test(c)))).slice(0, 20);
  const niveis = Array.from(new Set((params.get("niveis") ?? "1,2").split(",").map((n) => Number(n.trim())).filter((n) => [1, 2, 3].includes(n))));
  if (!codigos.length) return NextResponse.json({ error: "Vincule antes o usuário do Senior da pessoa." }, { status: 422 });
  if (!niveis.length) return NextResponse.json({ error: "Escolha ao menos um nível da alçada (1, 2 ou 3)." }, { status: 422 });

  try {
    const linhas = await emFilaSenior(() =>
      consultarSenior(`SELECT CODCCU, CODNAP FROM E068CNA WHERE ROTNAP=12 AND SITCNA='A' AND CODUSU IN (${codigos.join(",")}) AND CODNAP IN (${niveis.join(",")})`, { timeoutMs: 120_000 })
    );
    const porCcu = new Map<string, Set<number>>();
    for (const l of linhas) {
      const ccu = String(l.CODCCU ?? "").trim();
      if (!/^\d+$/.test(ccu)) continue;
      porCcu.set(ccu, (porCcu.get(ccu) ?? new Set()).add(Number(l.CODNAP)));
    }
    const ccus = Array.from(porCcu.entries()).map(([codccu, n]) => ({ codccu, niveis: Array.from(n).sort() })).sort((a, b) => Number(a.codccu) - Number(b.codccu));
    return NextResponse.json({ ccus, niveis });
  } catch {
    return NextResponse.json({ error: "Não consegui consultar o Senior agora. Tente de novo em instantes." }, { status: 502 });
  }
}
