import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Recebe as respostas do formulario publico de inventario (pagina hospedada no n8n). Sem sessao: protegido so' por chave compartilhada no
// cabecalho, porque quem chama e' o n8n, nunca o navegador do colaborador diretamente. So' grava; quem le e exporta e' a tela /inventario.
export async function POST(req: Request) {
  const chave = req.headers.get("x-inventario-key");
  if (!process.env.INVENTARIO_API_KEY || chave !== process.env.INVENTARIO_API_KEY) {
    return NextResponse.json({ ok: false, erro: "nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.nome !== "string" || typeof body.email !== "string" || typeof body.cidade !== "string" || !Array.isArray(body.contratos) || !body.contratos.length) {
    return NextResponse.json({ ok: false, erro: "dados incompletos" }, { status: 400 });
  }

  try {
    await prisma.inventarioSubmissao.create({
      data: {
        nome: body.nome,
        email: body.email,
        cidade: body.cidade,
        contratos: body.contratos,
        maquinas: Array.isArray(body.maquinas) ? body.maquinas : [],
        temLicenca: !!body.temLicencaEspecifica,
        licencas: Array.isArray(body.licencas) ? body.licencas : [],
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, erro: "nao foi possivel salvar" }, { status: 500 });
  }
}
