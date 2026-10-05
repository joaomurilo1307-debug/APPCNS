// Retorno de OC (05/10/2026, projeto "Retorno de OC pelo sistema de gestao
// APPCNS"): quando um titulo da Programacao de Pagamento e' revisado como
// APROVADO, avisa por e-mail quem criou a OC de origem. Criador e e-mail vem
// AO VIVO da Senior: E420OCP.USUGER -> E099USU.INTNET, casando CODEMP.
// E099USU tem uma linha por empresa e o MESMO CODUSU e' gente diferente em
// empresas diferentes (visto 05/10/2026: 159 = pedro.ferreira na maioria,
// pedro.andrade numa) -- por isso o join pela empresa da propria OC, e nao
// AprovacaoSenior.criadorCod sozinho.
//
// Nunca derruba a aprovacao: qualquer falha vira { enviado: false, motivo }.

import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { sendAvisoEmail } from "@/lib/mailer";
import { criarMotorVinculo, aplicarCorrecaoManual } from "@/lib/vinculoOcTitulo";

export type ResultadoAviso = { enviado: boolean; motivo: string; numOcp?: string; para?: string };

const soDigitos = (v: string | null | undefined) => {
  const t = (v || "").trim();
  return /^\d+$/.test(t) && !/^0+$/.test(t) ? t : null;
};

// Valores vao crus no SQL do GetDBInfo (sem bind) -- so' aceita digitos.
export function sqlEmailCriadorOc(numOcp: string, codFil?: string | null): string | null {
  const oc = soDigitos(numOcp);
  if (!oc) return null;
  const fil = soDigitos(codFil);
  return (
    `SELECT E420OCP.CODEMP, E420OCP.USUGER, E099USU.NOMUSU, E099USU.INTNET FROM E420OCP, E099USU ` +
    `WHERE E420OCP.NUMOCP = ${oc}${fil ? ` AND E420OCP.CODFIL = ${fil}` : ""} ` +
    `AND E099USU.CODEMP = E420OCP.CODEMP AND E099USU.CODUSU = E420OCP.USUGER`
  );
}

export function emailValido(email: string | null | undefined): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "não informado");

export function montarAviso(p: {
  numOcp: string;
  fornecedor: string;
  numTit: string;
  valor: number;
  vencimento: Date | null;
  aprovadoPor: string;
  nomeCriador: string;
}) {
  return {
    subject: `OC ${p.numOcp}: pagamento aprovado`,
    text: [
      `Olá, ${p.nomeCriador}.`,
      ``,
      `O pagamento referente à OC ${p.numOcp}, que você criou, foi revisado e aprovado na Programação de Pagamento.`,
      ``,
      `Fornecedor: ${p.fornecedor}`,
      `Título: ${p.numTit}`,
      `Valor: ${brl(p.valor)}`,
      `Vencimento programado: ${data(p.vencimento)}`,
      `Aprovado por: ${p.aprovadoPor}`,
      ``,
      `Este é um aviso automático do Consominas Gestão. Não responda este e-mail.`,
    ].join("\n"),
  };
}

export async function avisarCriadorOc(tituloId: string, aprovadoPor: string): Promise<ResultadoAviso> {
  try {
    const titulo = await prisma.tituloContasAPagar.findUnique({ where: { id: tituloId } });
    if (!titulo) return { enviado: false, motivo: "Título não encontrado" };

    // Mesmo vinculo que a tela mostra (motor automatico + correcao manual).
    // Todas as OCs (igual ao GET /api/titulos-pagar): o motor compara codigo de
    // fornecedor sem zeros a esquerda, um filtro exato no banco perderia OC.
    // ponytail: carrega a base de OCs a cada aprovacao; ok pro volume atual (1 clique = 1 aviso)
    const ocs = await prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true,
        dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true,
        contratoNome: true, temRateio: true, previsaoPagamento: true, criadorNome: true,
      },
    });
    const porNumero = new Map(ocs.map((o) => [o.numOcp, o]));
    const vinculo = aplicarCorrecaoManual(titulo, (n) => porNumero.get(n), criarMotorVinculo(ocs).ocRelacionadaDe(titulo));
    const oc = vinculo.ocRelacionada ? porNumero.get(vinculo.ocRelacionada.numOcp) : undefined;
    if (!oc) return { enviado: false, motivo: "Título sem OC vinculada" };

    const sql = sqlEmailCriadorOc(oc.numOcp, oc.codFil);
    if (!sql) return { enviado: false, motivo: `Número de OC inválido: ${oc.numOcp}`, numOcp: oc.numOcp };

    const linhas = (await consultarSenior(sql)).filter((l) => emailValido(l.INTNET));
    const emails = [...new Set(linhas.map((l) => l.INTNET.trim().toLowerCase()))];
    if (emails.length === 0) {
      return { enviado: false, motivo: `Criador da OC ${oc.numOcp} sem e-mail no Senior (E099USU.INTNET)`, numOcp: oc.numOcp };
    }
    if (emails.length > 1) {
      // mesma OC em mais de uma empresa/filial -- nao chuta destinatario
      return { enviado: false, motivo: `OC ${oc.numOcp} existe em mais de uma empresa no Senior, destinatário ambíguo`, numOcp: oc.numOcp };
    }

    const para = emails[0];
    const nome = oc.criadorNome || linhas[0].NOMUSU || para;
    const aviso = montarAviso({
      numOcp: oc.numOcp,
      fornecedor: titulo.fornecedorNome || oc.fornecedorNome || `código ${titulo.codFor}`,
      numTit: titulo.numTit,
      valor: titulo.valorAberto || titulo.valorOriginal,
      vencimento: titulo.vencimentoProgramado ?? titulo.vencimentoOriginal,
      aprovadoPor,
      nomeCriador: nome,
    });
    const ok = await sendAvisoEmail({ to: [{ email: para, name: nome }], ...aviso });
    return ok
      ? { enviado: true, motivo: "Enviado", numOcp: oc.numOcp, para }
      : { enviado: false, motivo: "Falha no envio (SMTP de aviso não configurado ou recusou)", numOcp: oc.numOcp, para };
  } catch (err) {
    console.error("Aviso de pagamento aprovado falhou:", err);
    return { enviado: false, motivo: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
