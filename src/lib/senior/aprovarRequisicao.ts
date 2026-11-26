// Aprovacao de REQUISICAO DE ESTOQUE (rotina de aprovacao 3 da Senior, um nivel: "Coordenacao").
//
// LISTA: SQL somente leitura (GetDBInfo) -- nao existe porta nativa que liste as pendentes de um aprovador. Tabelas validadas no tenant
// em 27/11/2026: E207EME (requisicao: ROTNAP=3, SITAPR='ANA' = aguardando aprovacao, CCURES = centro de custo responsavel, SITEME=1 digitada)
// e E068CNA (cadastro mestre: usuario x CCU, ROTNAP=3, SITCNA='A'). Aprovador da requisicao = quem esta no E068CNA para o CCURES dela.
// APROVAR: web service nativo com.senior.g5.co.mcm.est.aprovarrequisicoes, porta AprovarRequisicoes (doc oficial ERP 5.10.4 + XSD do tenant:
// gridRequisicoes{codEmp,codUsu,numEme,qtdEme,seqEme}, ordem alfabetica). Numeros com ponto decimal e SEM separador de milhar.
// REPROVAR: a Senior nao tem porta nativa para isso -- fica para uma porta customizada.

import { consultarSenior } from "./getDbInfo";
import { blocos, campo, envelope, falhaDoEnvelope, numeroSenior, type Credencial } from "./aprovarOc";

export const EMPRESA_REQUISICAO = 1;
const ROTINA_REQUISICAO = 3;
const URL_PADRAO = "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_mcm_est_aprovarrequisicoes";

export type RequisicaoPendente = {
  codigoEmpresa: number;
  numero: number;
  sequencia: number;
  dataEmissao: string;
  produto: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  preco: number;
  solicitante: string;
  centroCusto: string;
  centroCustoDescricao: string;
  observacao: string;
  /** CODUSU do aprovador (um dos da pessoa) que esta cadastrado para o centro de custo da requisicao */
  codUsu: number;
};
export type Chave = { codigoEmpresa: number; numero: number; sequencia: number };

const so = (v: string) => v.replace(/'/g, "");
const inteiro = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;

/** Pendentes de aprovacao da pessoa: requisicoes ANA cujo centro de custo tem a pessoa como aprovadora (E068CNA). */
export async function listarRequisicoesPendentes(codigosUsuario: string[], consultar: typeof consultarSenior = consultarSenior): Promise<RequisicaoPendente[]> {
  const codigos = [...new Set(codigosUsuario.map((c) => Number(c)).filter(inteiro))];
  if (!codigos.length) return [];
  const cadastro = await consultar(
    `SELECT CODUSU, CODCCU FROM E068CNA WHERE CODEMP IN (${EMPRESA_REQUISICAO}) AND ROTNAP IN (${ROTINA_REQUISICAO}) AND SITCNA IN ('A') AND CODUSU IN (${codigos.join(",")})`
  );
  const porCcu = new Map<string, number>();
  for (const l of cadastro) if (l.CODCCU && !porCcu.has(l.CODCCU)) porCcu.set(l.CODCCU, Number(l.CODUSU));
  if (!porCcu.size) return [];

  const linhas = await consultar(
    `SELECT CODEMP, NUMEME, SEQEME, DATEME, CODPRO, CPLPRO, UNIMED, QTDEME, PREEME, USUSOL, CCURES, OBSEME FROM E207EME ` +
      `WHERE CODEMP IN (${EMPRESA_REQUISICAO}) AND ROTNAP IN (${ROTINA_REQUISICAO}) AND SITAPR IN ('ANA') AND SITEME IN (1)`
  );
  const minhas = linhas.filter((l) => porCcu.has(l.CCURES));
  if (!minhas.length) return [];

  const nomes = new Map<string, string>();
  const solicitantes = [...new Set(minhas.map((l) => Number(l.USUSOL)).filter(inteiro))];
  if (solicitantes.length)
    for (const u of await consultar(`SELECT CODUSU, NOMUSU FROM E099USU WHERE CODEMP IN (${EMPRESA_REQUISICAO}) AND CODUSU IN (${solicitantes.join(",")})`).catch(() => []))
      nomes.set(u.CODUSU, u.NOMUSU);
  const ccus = [...new Set(minhas.map((l) => l.CCURES))];
  const descricoes = new Map<string, string>();
  for (const c of await consultar(`SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP IN (${EMPRESA_REQUISICAO}) AND CODCCU IN (${ccus.map((c) => `'${so(c)}'`).join(",")})`).catch(() => []))
    descricoes.set(c.CODCCU, c.DESCCU);

  return minhas
    .map((l): RequisicaoPendente => ({
      codigoEmpresa: Number(l.CODEMP),
      numero: Number(l.NUMEME),
      sequencia: Number(l.SEQEME),
      dataEmissao: l.DATEME,
      produto: l.CODPRO,
      descricao: l.CPLPRO,
      unidade: l.UNIMED,
      quantidade: numeroSenior(l.QTDEME),
      preco: numeroSenior(l.PREEME),
      solicitante: nomes.get(l.USUSOL) ?? l.USUSOL,
      centroCusto: l.CCURES,
      centroCustoDescricao: descricoes.get(l.CCURES) ?? "",
      observacao: l.OBSEME,
      codUsu: porCcu.get(l.CCURES)!,
    }))
    .sort((a, b) => a.numero - b.numero || a.sequencia - b.sequencia);
}

/** Numero para o XML: ponto decimal, sem milhar (a Senior da' erro com separador de milhar). */
const decimal = (n: number) => String(Number(n.toFixed(4)));

export function envelopeAprovarRequisicao(c: Credencial, codUsu: number, k: Chave, quantidade: number): string {
  if (!inteiro(k.codigoEmpresa) || !inteiro(k.numero) || !inteiro(k.sequencia) || !inteiro(codUsu)) throw new Error("Empresa/requisição/usuário inválido.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
  return envelope(
    "AprovarRequisicoes",
    c,
    `<gridRequisicoes><codEmp>${k.codigoEmpresa}</codEmp><codUsu>${codUsu}</codUsu><numEme>${k.numero}</numEme><qtdEme>${decimal(quantidade)}</qtdEme><seqEme>${k.sequencia}</seqEme></gridRequisicoes>`
  );
}

/** Sucesso so' com tpResultado 1, erroExecucao vazio e nenhuma linha em gridRetorno; qualquer ambiguidade vira erro. */
export function lerAprovacaoRequisicao(xml: string): { ok: boolean; mensagem: string } {
  const falha = falhaDoEnvelope(xml);
  if (falha) return { ok: false, mensagem: falha };
  const erro = campo(xml, "erroExecucao");
  if (erro) return { ok: false, mensagem: erro };
  const retornos = blocos(xml, "gridRetorno").map((b) => campo(b, "txtRet")).filter(Boolean);
  if (retornos.length) return { ok: false, mensagem: retornos.join("; ") };
  if (campo(xml, "tpResultado") === "1") return { ok: true, mensagem: campo(xml, "resultado") || "Processado com sucesso" };
  return { ok: false, mensagem: campo(xml, "resultado") || "Resposta da Senior não reconhecida; confira a requisição na Senior." };
}

export async function aprovarRequisicao(c: Credencial, codUsu: number, k: Chave, quantidade: number, fetchImpl: typeof fetch = fetch) {
  const r = await fetchImpl(process.env.SENIOR_WS_APROVARREQUISICOES_URL?.trim() || URL_PADRAO, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
    body: envelopeAprovarRequisicao(c, codUsu, k, quantidade),
    signal: AbortSignal.timeout(60_000),
  });
  const texto = await r.text();
  if (!r.ok && !falhaDoEnvelope(texto)) throw new Error(`Senior respondeu HTTP ${r.status}.`);
  return lerAprovacaoRequisicao(texto);
}
