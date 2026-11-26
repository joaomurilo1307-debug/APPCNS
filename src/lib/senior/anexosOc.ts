// Anexos de UMA OC na Senior, lidos ao vivo (GetDBInfo, so' leitura), para a janela "Editar dossiê".
//
// Conferido em 25/11/2026: E420OCP.ROTANX (48 = Ordem de Compra) + E420OCP.NUMANX apontam para E000ANX (CODEMP, ROTANX,
// NUMANX, SEQANX, DESANX, LOCANX, DATGER, USUGER). NUMANX e' unico por empresa+rotina (4 OCs antigas, copiadas, dividem o
// mesmo numero). A NF de compra (E440NFC) e o titulo (E501TCP) tambem tem NUMANX, mas praticamente sem anexos.
// A Senior guarda so' o caminho do arquivo -- ver lib/dossie/anexosSenior.ts.

import { consultarSenior, type LinhaSenior } from "./getDbInfo";
import { COD_EMP, dataIso } from "./ocsConferencia";
import { localDoCaminho, nomeDoArquivo, type AnexoSenior } from "@/lib/dossie/anexosSenior";

/** Rotina de anexos da Ordem de Compra na Senior. */
export const ROTINA_ANEXO_OC = 48;

const codigo = (v: string | undefined) => String(Number((v ?? "").trim()) || 0);

/** Linhas da E000ANX -> anexos na ordem em que foram incluidos. `nomes`: CODUSU -> nome (E099USU). */
export function paraAnexosSenior(linhas: LinhaSenior[], nomes: Map<string, string>): AnexoSenior[] {
  return linhas
    .map((l) => {
      const caminho = (l.LOCANX ?? "").trim();
      const descricao = (l.DESANX ?? "").trim();
      const usuario = codigo(l.USUGER);
      return {
        seq: Number(l.SEQANX) || 0,
        descricao,
        arquivo: caminho ? nomeDoArquivo(caminho) : descricao,
        caminho,
        local: localDoCaminho(caminho),
        anexadoEm: dataIso(l.DATGER),
        anexadoPor: nomes.get(usuario) ?? (usuario !== "0" ? `usuário ${usuario} da Senior` : null),
      };
    })
    .filter((a) => a.arquivo)
    .sort((a, b) => a.seq - b.seq);
}

/** Anexos da OC na Senior. null = OC nao encontrada. */
export async function lerAnexosDaOc(numOcp: string, codFil: string): Promise<AnexoSenior[] | null> {
  if (!/^\d+$/.test(numOcp) || !/^\d+$/.test(codFil)) throw new Error("OC/filial inválida.");
  const [oc] = await consultarSenior(`SELECT ROTANX, NUMANX FROM E420OCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`);
  if (!oc) return null;
  const numAnx = Number(codigo(oc.NUMANX));
  if (!numAnx) return [];
  const rotina = Number(codigo(oc.ROTANX)) || ROTINA_ANEXO_OC;
  const linhas = await consultarSenior(
    `SELECT SEQANX, DESANX, LOCANX, DATGER, USUGER FROM E000ANX WHERE CODEMP = ${COD_EMP} AND ROTANX = ${rotina} AND NUMANX = ${numAnx}`,
  );
  const usuarios = [...new Set(linhas.map((l) => codigo(l.USUGER)).filter((u) => u !== "0"))];
  const nomes = new Map<string, string>();
  if (usuarios.length) {
    const cadastro = await consultarSenior(`SELECT CODUSU, NOMUSU FROM E099USU WHERE CODEMP = ${COD_EMP} AND CODUSU IN (${usuarios.join(",")})`);
    for (const u of cadastro) if (u.NOMUSU?.trim()) nomes.set(codigo(u.CODUSU), u.NOMUSU.trim());
  }
  return paraAnexosSenior(linhas, nomes);
}
