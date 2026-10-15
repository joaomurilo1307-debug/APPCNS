// Situacao de uma NF de ENTRADA na Senior (so' leitura): ja foi lancada (E440NFC) e, se a
// entrada da nota ja gerou titulo a pagar (E501TCP.NUMNFC), qual. Serve pra o financeiro
// nao gerar um segundo titulo quando a propria entrada da NF ja criou o dele.

import { consultarSenior } from "./getDbInfo";
import { COD_EMP } from "./ocsConferencia";

export type NfNoSenior = { lancada: boolean; tituloDaNf: string | null };

export async function situacaoNfNoSenior(codFor: string, numeroNf: string): Promise<NfNoSenior> {
  const numero = numeroNf.replace(/\D/g, "").replace(/^0+/, "");
  if (!/^\d+$/.test(codFor) || !/^\d{1,9}$/.test(numero)) return { lancada: false, tituloDaNf: null };
  const nota = await consultarSenior(`SELECT NUMNFC FROM E440NFC WHERE CODEMP IN (${COD_EMP}) AND CODFOR IN (${codFor}) AND NUMNFC IN (${numero})`);
  const titulo = await consultarSenior(`SELECT NUMTIT, CODTPT FROM E501TCP WHERE CODEMP IN (${COD_EMP}) AND CODFOR IN (${codFor}) AND NUMNFC IN (${numero})`);
  return { lancada: nota.length > 0, tituloDaNf: titulo[0] ? `${titulo[0].CODTPT} ${titulo[0].NUMTIT}` : null };
}
