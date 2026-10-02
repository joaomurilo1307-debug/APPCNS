// Cliente do web service GerarBaixaPorLoteCP da Senior (Sapiens G5, pacote
// com.senior.g5.co.mfi.cpa.titulos): da baixa em lote de titulos a pagar pelo
// numero do titulo. Diferente do GetDBInfo (somente leitura), ESTE ESCREVE no
// contas a pagar e na tesouraria da Senior -- so' chamar depois de o banco
// confirmar o pagamento e de conferir na propria Senior que o titulo ainda esta
// aberto (ver /api/pagamentos-itau/remessas/[id]/baixa-senior).
//
// Contrato conferido na documentacao oficial (01/10/2026):
// documentacao.senior.com.br/goup/5.10.3/webservices/com_senior_g5_co_mfi_cpa_titulos.htm
//
// Codigos deste tenant, confirmados em dado real da Senior (01/10/2026):
//   tnsBai 90550 = faixa 90550-90579 "Pagamento de Titulo" (F001TPA), a mais usada nas baixas
//   tnsCxb 90650 = "Debito Pagamento Contas a Pagar (CP)" (E001TNS); as baixas pela conta
//                  interna "341" (Itau) usam 90650. 90665 e' "Debito Cheque - CP" e 90656 e'
//                  transferencia entre contas -- nao servem pra pagamento eletronico.

import type { LinhaSenior } from "./getDbInfo";

export const TNS_BAIXA_CP = "90550";
export const TNS_TESOURARIA_CP = "90650";
export const COD_EMP_PADRAO = 1;

const URL_PADRAO_BAIXA =
  "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_mfi_cpa_titulos";

export type TituloParaBaixa = {
  /** Eco devolvido pela Senior em gridRetorno.numInt -- usado pra casar a resposta com o item. */
  numInt: string;
  codFil: number;
  numTit: string;
  codTpt: string;
  codFor: number;
  valor: number;
  obs?: string;
};

export type LoteBaixa = {
  codEmp: number;
  codFil: number;
  datBai: Date;
  numCco: string;
  tnsBai?: string;
  tnsCxb?: string;
  titulos: TituloParaBaixa[];
};

export type RetornoBaixaTitulo = { numInt: string; numTit: string; codFor: string; msgErr: string };

export type ResultadoBaixa = {
  /** true somente se a Senior respondeu resultado "OK" e sem erroExecucao. */
  ok: boolean;
  resultado: string;
  erroExecucao: string;
  itens: RetornoBaixaTitulo[];
};

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function desescaparXml(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Campos declarados String na Senior: virgula decimal, sempre 2 casas, sem milhar ("1658,55"). */
export function valorSenior(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`Valor invalido para baixa: ${valor}`);
  return (Math.round(valor * 100) / 100).toFixed(2).replace(".", ",");
}

/** Datas dos web services Senior: dd/MM/aaaa (usa a data UTC, que e' como o app guarda datas sem hora). */
export function dataSenior(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, "0");
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${data.getUTCFullYear()}`;
}

export function montarEnvelopeBaixa(lote: LoteBaixa, usuario: string, senha: string): string {
  if (lote.titulos.length === 0) throw new Error("Lote de baixa vazio.");
  if (!lote.numCco.trim() || lote.numCco.length > 14) throw new Error("numCco invalido (1 a 14 caracteres).");

  // Os campos saem na ordem do XSD real do servidor (xs:sequence, alfabetica,
  // conferido em ...cpa_titulos?xsd em 02/10/2026), nao na ordem do exemplo do
  // manual -- assim nao depende de o servidor ser tolerante com a ordem.
  const dataBaixa = dataSenior(lote.datBai);
  const grade = lote.titulos
    .map(
      (t) =>
        `<gridTitulosBaixar>` +
        `<codFil>${t.codFil}</codFil>` +
        `<codFor>${t.codFor}</codFor>` +
        `<codTpt>${escaparXml(t.codTpt.slice(0, 3))}</codTpt>` +
        `<numCco>${escaparXml(lote.numCco)}</numCco>` +
        `<numInt>${escaparXml(t.numInt.slice(0, 100))}</numInt>` +
        `<numTit>${escaparXml(t.numTit.slice(0, 15))}</numTit>` +
        (t.obs ? `<obsMcp>${escaparXml(t.obs.slice(0, 250))}</obsMcp>` : "") +
        `<vlrBai>${valorSenior(t.valor)}</vlrBai>` +
        `</gridTitulosBaixar>`
    )
    .join("");

  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:GerarBaixaPorLoteCP>` +
    `<user>${escaparXml(usuario)}</user><password>${escaparXml(senha)}</password><encryption>0</encryption>` +
    `<parameters>` +
    `<codEmp>${lote.codEmp}</codEmp><codFil>${lote.codFil}</codFil>` +
    `<datBai>${dataBaixa}</datBai><datCxb>${dataBaixa}</datCxb>` +
    grade +
    `<numCco>${escaparXml(lote.numCco)}</numCco>` +
    `<tnsBai>${escaparXml(lote.tnsBai ?? TNS_BAIXA_CP)}</tnsBai>` +
    `<tnsCxb>${escaparXml(lote.tnsCxb ?? TNS_TESOURARIA_CP)}</tnsCxb>` +
    `</parameters></ser:GerarBaixaPorLoteCP></soapenv:Body></soapenv:Envelope>`
  );
}

function campo(bloco: string, nome: string): string {
  const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(bloco);
  return m ? desescaparXml(m[1]).trim() : "";
}

export function lerRespostaBaixa(texto: string): ResultadoBaixa {
  const falha = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(texto);
  if (falha) return { ok: false, resultado: "", erroExecucao: desescaparXml(falha[1]).trim(), itens: [] };

  const resultado = campo(texto, "resultado");
  const erroExecucao = campo(texto, "erroExecucao");
  const itens: RetornoBaixaTitulo[] = [];
  for (const bloco of texto.matchAll(/<gridRetorno>([\s\S]*?)<\/gridRetorno>/g)) {
    itens.push({
      numInt: campo(bloco[1], "numInt"),
      numTit: campo(bloco[1], "numTit"),
      codFor: campo(bloco[1], "codFor"),
      msgErr: campo(bloco[1], "msgErr"),
    });
  }
  return { ok: resultado.toUpperCase() === "OK" && !erroExecucao, resultado, erroExecucao, itens };
}

export async function gerarBaixaPorLoteCP(
  lote: LoteBaixa,
  opcoes: { fetchImpl?: typeof fetch } = {}
): Promise<ResultadoBaixa> {
  const usuario = process.env.SENIOR_WS_SAPIENS_USER;
  const senha = process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) {
    throw new Error("Defina SENIOR_WS_SAPIENS_USER e SENIOR_WS_SAPIENS_PASSWORD no .env (nao versionado).");
  }
  const url = process.env.SENIOR_WS_BAIXA_URL ?? URL_PADRAO_BAIXA;
  const resposta = await (opcoes.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
    body: montarEnvelopeBaixa(lote, usuario, senha),
  });
  return lerRespostaBaixa(await resposta.text());
}

/** "1658,55" (formato da Senior) -> 1658.55. */
export function numeroDaSenior(valor: string | undefined): number {
  if (!valor) return 0;
  return Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
}

/** Conferencia ao vivo (somente leitura): situacao do titulo na Senior e quanto falta pagar. */
export function situacaoDoTituloNaSenior(linhas: LinhaSenior[]): {
  existe: boolean;
  aberto: boolean;
  sittit: string;
  valorAberto: number;
} {
  if (linhas.length === 0) return { existe: false, aberto: false, sittit: "", valorAberto: 0 };
  const l = linhas[0];
  const valorAberto = numeroDaSenior(l.VLRABE);
  return { existe: true, aberto: l.SITTIT === "AB" && valorAberto > 0, sittit: l.SITTIT ?? "", valorAberto };
}
