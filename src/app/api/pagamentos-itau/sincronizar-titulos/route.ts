import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consultarSenior, type LinhaSenior } from "@/lib/senior/getDbInfo";
import {
  CAMPOS_CADASTRO_BANCARIO,
  CAMPOS_TITULO,
  escolherCadastroBancario,
  mapearTitulo,
  type ItemSyncTitulo,
} from "@/lib/senior/mapeamentoTitulos";

// Botão "Atualizar do Senior agora" do /pagamentos-itau -- fecha a lacuna de
// só existir o jeito manual (`npm run senior:sync` por terminal, com
// credencial na própria máquina) pra atualizar a tabela espelho
// TituloContasAPagar antes de montar uma remessa. Sem isso, dá pra gerar um
// arquivo de pagamento com dado velho (título já pago/alterado na Senior
// depois do último sync manual).
//
// Mesma lógica do script scripts/senior-sync-pagamentos.ts (mesmas
// consultas, mesmo mapeamento, mesmo upsert incremental via
// POST /api/senior/titulos-pagar/sync?modo=incremental) -- só troca "rodar
// no terminal" por "clicar na tela". Não duplica a regra de upsert: chama a
// própria rota de sync internamente, igual o script já fazia.

const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];
const TAMANHO_LOTE = 200;
const TAMANHO_LOTE_CODFOR = 400; // limite do IN() da Senior e' ~1000 (ORA-01795) -- 400 da margem

// Busca em lotes por CODFOR IN (...) -- so' os fornecedores que aparecem nos
// titulos de hoje, nao a tabela inteira.
async function porLotesDeCodFor(sqlBase: string, codigos: string[]): Promise<LinhaSenior[]> {
  const resultado: LinhaSenior[] = [];
  for (let i = 0; i < codigos.length; i += TAMANHO_LOTE_CODFOR) {
    const lote = codigos.slice(i, i + TAMANHO_LOTE_CODFOR).join(",");
    resultado.push(...(await consultarSenior(`${sqlBase} CODFOR IN (${lote})`)));
  }
  return resultado;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const chave = process.env.SENIOR_SYNC_KEY;
  if (!chave) return NextResponse.json({ error: "SENIOR_SYNC_KEY não configurada no ambiente do app" }, { status: 500 });

  try {
    const titulos = await consultarSenior(`SELECT ${CAMPOS_TITULO.join(", ")} FROM E501TCP WHERE SITTIT = 'AB'`);

    // ACHADO 30/09/2026: aqui buscava E095FOR inteira (2400+ linhas) e E095HFO
    // travada em CODEMP=1 (19 mil linhas, ~2min) -- essa consulta dupla
    // estourava o timeout do proxy da Hostinger e a rota caia com 502, sem
    // NENHUM dado bancario chegar (achado ao vivo: Edilson Fernandes Batista
    // e outros 2415 titulos, 100% sem CPF/CNPJ/conta). Escopo agora e' so' os
    // fornecedores dos titulos de hoje, em lotes -- e sem o CODEMP=1 (fornecedor
    // pode ter conta cadastrada so' numa outra empresa do grupo).
    // Sequencial, nao Promise.all -- achado 30/09/2026: 2 lotes de consulta
    // concorrentes contra o mesmo web service da Senior derrubaram a conexao
    // ("fetch failed"). O ganho de velocidade do paralelo nao compensa a
    // instabilidade numa hora com a programacao de pagamento correndo contra
    // o horario do banco.
    const codigosFor = [...new Set(titulos.map((t) => t.CODFOR).filter((c) => /^\d+$/.test(c)))];
    const fornecedores = await porLotesDeCodFor("SELECT CODFOR, NOMFOR, CGCCPF, TIPFOR FROM E095FOR WHERE", codigosFor);
    const cadastros = await porLotesDeCodFor(`SELECT ${CAMPOS_CADASTRO_BANCARIO.join(", ")} FROM E095HFO WHERE`, codigosFor);

    const porCodigo = new Map(fornecedores.map((f) => [f.CODFOR, f]));
    const cadastrosPorFornecedor = new Map<string, LinhaSenior[]>();
    for (const c of cadastros) cadastrosPorFornecedor.set(c.CODFOR, [...(cadastrosPorFornecedor.get(c.CODFOR) ?? []), c]);

    const itens = titulos
      .map((t) =>
        mapearTitulo(t, porCodigo.get(t.CODFOR), escolherCadastroBancario(cadastrosPorFornecedor.get(t.CODFOR), t.CODEMP, t.CODFIL))
      )
      .filter((i): i is ItemSyncTitulo => i !== null);

    const origin = new URL(req.url).origin;
    let processados = 0;
    for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
      const lote = itens.slice(i, i + TAMANHO_LOTE);
      const resposta = await fetch(`${origin}/api/senior/titulos-pagar/sync?modo=incremental`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-sync-key": chave },
        body: JSON.stringify({ itens: lote }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(`Lote ${i / TAMANHO_LOTE + 1} recusado pelo app: ${JSON.stringify(corpo).slice(0, 300)}`);
      processados += corpo.processados ?? 0;
    }

    return NextResponse.json({
      ok: true,
      totalSenior: itens.length,
      processados,
      comContaCompleta: itens.filter((i) => i.bancoFavorecido && i.agenciaFavorecido && i.contaFavorecido && i.dacFavorecido).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Erro consultando o Senior: ${e.message}` }, { status: 502 });
  }
}
