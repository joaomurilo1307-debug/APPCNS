import { prisma } from "@/lib/prisma";
import { ROTULO_STATUS, LIMITES, descricaoDoLancamento, referenciaDoLancamento, type StatusContestacao } from "@/lib/contestacoes";
import { ACOES_POR_EMAIL, ROTULO_ACAO, eAcaoEmail, verificarLink, type AcaoEmail } from "@/lib/contestacoesToken";
import { decidirContestacao } from "@/lib/contestacoesServidor";

// Resposta da contestacao de custo PELO E-MAIL (sem login): a Monica clica no link do e-mail, ve o pedido e confirma com um botao. O link e' assinado (contestacoesToken.ts) e vale
// 45 dias. GET so' MOSTRA a pagina (leitores de e-mail que abrem links nao decidem nada); quem decide e' o POST do botao. Nao altera o Senior: registra o andamento
// (aceita / realocado / rejeitada) e avisa, dentro do sistema, quem contestou. A tela Ao vivo passa a mostrar "Contestado" e depois "Realocado".

export const dynamic = "force-dynamic";

const esc = (s: string | null | undefined) => (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function pagina(titulo: string, corpo: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f6f8;margin:0;color:#1f2937}main{max-width:640px;margin:32px auto;padding:0 16px}.c{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:20px;margin:0 0 4px}p{line-height:1.5}.m{color:#6b7280;font-size:13px}dl{margin:16px 0;display:grid;grid-template-columns:130px 1fr;gap:6px 12px;font-size:14px}dt{color:#6b7280}dd{margin:0;font-weight:500}
.j{background:#f3f4f6;border-radius:10px;padding:10px 12px;white-space:pre-wrap;font-size:14px}textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:10px;padding:10px;font:inherit;margin-top:6px}
button{margin-top:14px;background:#0e9f94;color:#fff;border:0;border-radius:10px;padding:11px 20px;font-size:15px;font-weight:600;cursor:pointer}.ok{color:#047857}.er{color:#b91c1c}.tag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}</style></head>
<body><main><div class="c">${corpo}</div><p class="m">Consominas Gestão · resposta de contestação de custo</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

const segredo = () => process.env.NEXTAUTH_SECRET ?? "";
const parametros = (u: URL | FormData) => {
  const g = (k: string) => (u instanceof FormData ? (typeof u.get(k) === "string" ? (u.get(k) as string) : null) : u.searchParams.get(k));
  return { id: g("id"), acao: g("acao"), exp: g("exp"), t: g("t") };
};

function resumoHtml(c: { fornecedor: string; numTit: string | null; numOcp: string | null; valor: number; ccuNome: string | null; codccu: string; linhaCusto: string | null; justificativa: string; status: string; autor: { name: string } }) {
  return `<h1>Contestação de custo</h1><p><span class="tag">${esc(ROTULO_STATUS[c.status as StatusContestacao] ?? c.status)}</span></p>
<dl><dt>Fornecedor</dt><dd>${esc(c.fornecedor)}</dd><dt>OC</dt><dd>${esc(c.numOcp || "não ligada")}</dd><dt>Título</dt><dd>${esc(c.numTit || "sem título")}</dd><dt>Valor</dt><dd>${esc(moeda(c.valor))}</dd>
<dt>Centro de custo</dt><dd>${esc(c.ccuNome || `CCU ${c.codccu}`)} (CCU ${esc(c.codccu)})</dd>${c.linhaCusto ? `<dt>Linha de custo</dt><dd>${esc(c.linhaCusto)}</dd>` : ""}<dt>Contestado por</dt><dd>${esc(c.autor.name)}</dd></dl>
<p class="m">Motivo da contestação:</p><div class="j">${esc(c.justificativa)}</div>`;
}

async function carregar(id: string) {
  return prisma.contestacaoCusto.findUnique({ where: { id }, select: { id: true, fornecedor: true, numTit: true, numOcp: true, valor: true, ccuNome: true, codccu: true, linhaCusto: true, justificativa: true, status: true, parecer: true, autor: { select: { name: true } } } });
}

export async function GET(req: Request) {
  const p = parametros(new URL(req.url));
  const v = verificarLink(segredo(), p);
  if (v === "invalido") return pagina("Link inválido", `<h1 class="er">Link inválido</h1><p>Este link não é válido. Use o botão do e-mail original ou a tela Contestações do sistema.</p>`, 400);
  if (v === "expirado") return pagina("Link vencido", `<h1 class="er">Link vencido</h1><p>Este link passou da validade (45 dias). Responda pela tela Contestações do sistema.</p>`, 410);
  const c = await carregar(p.id!);
  if (!c) return pagina("Não encontrada", `<h1 class="er">Contestação não encontrada</h1>`, 404);
  const acao = p.acao as AcaoEmail;
  const novo = ACOES_POR_EMAIL[acao];
  const jaFeito = c.status === novo || c.status === "REALOCADA" || c.status === "REJEITADA" || (c.status === "ACEITA" && novo === "ACEITA");
  if (jaFeito) return pagina("Já registrado", `${resumoHtml(c)}<p class="ok"><b>Já está registrado:</b> ${esc(ROTULO_STATUS[c.status as StatusContestacao])}.${c.status === "ACEITA" ? " Quando realocar no Senior, use o link “Já realocado” do e-mail." : ""}</p>`);
  const discordo = acao === "discordo";
  return pagina(ROTULO_ACAO[acao], `${resumoHtml(c)}<form method="post" action="/api/contestacoes/resposta"><input type="hidden" name="id" value="${esc(p.id)}"><input type="hidden" name="acao" value="${esc(p.acao)}"><input type="hidden" name="exp" value="${esc(p.exp)}"><input type="hidden" name="t" value="${esc(p.t)}">
<p><b>${esc(ROTULO_ACAO[acao])}</b></p><label class="m" for="parecer">${discordo ? "Motivo (obrigatório)" : "Observação (opcional)"}</label><textarea id="parecer" name="parecer" rows="3" maxlength="${LIMITES.parecerMax}" ${discordo ? "required minlength=\"5\"" : ""}></textarea>
<button type="submit">Confirmar</button></form>`);
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return pagina("Pedido inválido", `<h1 class="er">Pedido inválido</h1>`, 400);
  const p = parametros(form);
  const v = verificarLink(segredo(), p);
  if (v !== "ok") return pagina(v === "expirado" ? "Link vencido" : "Link inválido", `<h1 class="er">${v === "expirado" ? "Link vencido" : "Link inválido"}</h1><p>Responda pela tela Contestações do sistema.</p>`, v === "expirado" ? 410 : 400);
  const parecer = typeof form.get("parecer") === "string" ? (form.get("parecer") as string).trim() : "";
  const novo = ACOES_POR_EMAIL[p.acao as AcaoEmail];
  const r = await decidirContestacao(p.id!, novo, parecer || null, { userId: null, nome: "O financeiro (resposta por e-mail)", via: "e-mail" });
  const c = await carregar(p.id!);
  if (!r.ok) {
    if (c && r.codigo === 409) return pagina("Já registrado", `${resumoHtml(c)}<p class="ok"><b>Já estava registrado:</b> ${esc(ROTULO_STATUS[c.status as StatusContestacao])}.</p>`);
    return pagina("Não foi possível registrar", `<h1 class="er">Não foi possível registrar</h1><p>${esc(r.erro)}</p>`, r.codigo);
  }
  const texto = novo === "ACEITA" ? "Registrado: aceita. Quando realocar no Senior, use o link “Já realocado” do e-mail; quem contestou será avisado." : novo === "REALOCADA" ? "Registrado: realocado. Quem contestou foi avisado e o lançamento aparece como “Realocado” na tela Ao vivo." : "Registrado: contestação rejeitada. Quem contestou foi avisado.";
  return pagina("Registrado", `<h1 class="ok">Registrado ✔</h1><p>${esc(texto)}</p>${c ? `<p class="m">${esc(descricaoDoLancamento({ fornecedor: c.fornecedor, numTit: c.numTit, numOcp: c.numOcp, valor: c.valor, ccuNome: c.ccuNome, codccu: c.codccu }))} (${esc(referenciaDoLancamento(c))})</p>` : ""}`);
}
