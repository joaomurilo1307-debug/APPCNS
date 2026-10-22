import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { listarNotasRecebidas } from "@/lib/edocs/notasRecebidas";
import { pagamentoDasNotas } from "@/lib/edocs/pagamentoNotas";

// Notas fiscais emitidas contra a Consominas (eDocs X). Emissao/numero/fornecedor/valor vem da lista;
// vencimento e forma de pagamento vem do XML de cada nota, lido uma vez e guardado (NfRecebidaPagamento).
// Se faltar XML por ler, le ate' o orcamento de tempo e devolve "pendentes" -- a tela chama de novo.

const ORCAMENTO_MS = 40_000;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "notas_fiscais");
  if (negado) return negado;

  try {
    const forcar = new URL(req.url).searchParams.get("atualizar") === "1";
    const notas = await listarNotasRecebidas(forcar);
    const porChave = await pagamentoDasNotas(notas, ORCAMENTO_MS);
    const linhas = notas
      .map((n) => {
        const p = porChave.get(n.chave);
        return { ...n, lido: !!p, vencimentos: p?.vencimentos ?? [], formasPag: p?.formasPag ?? [], indPag: p?.indPag ?? null };
      })
      .sort((a, b) => (b.emissao ?? "").localeCompare(a.emissao ?? ""));
    return NextResponse.json({ notas: linhas, pendentes: linhas.filter((l) => !l.lido).length });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível consultar o eDocs: ${(e as Error).message}` }, { status: 502 });
  }
}
