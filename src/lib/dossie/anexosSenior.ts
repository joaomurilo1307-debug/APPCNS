// Anexos que a OC tem na Senior (tela F000ANX), mostrados na janela "Editar dossiê" -- so' funcoes puras, usadas no
// servidor (lib/senior/anexosOc.ts) e no navegador (components/EditarDossie.tsx).
//
// A Senior guarda SO' O CAMINHO do arquivo (E000ANX.LOCANX), nunca o arquivo. Em 25/11/2026 quase todos estavam no servidor
// de arquivos da nuvem Senior (\\FS01S1P\Consominas_Diversos$, ou o mesmo visto como drive Z: na sessao remota), que o Gestao
// nao alcanca; alguns apontam para \\tsclient\..., o computador de quem anexou. Por isso a janela so' lista o que a OC tem e
// o que ainda falta anexar ao dossie.

export type LocalAnexoSenior = "SERVIDOR_SENIOR" | "DRIVE_DA_SESSAO" | "PC_DO_USUARIO" | "OUTRO";

export type AnexoSenior = {
  seq: number;
  /** Descricao digitada na Senior (DESANX); quase sempre o proprio nome do arquivo. */
  descricao: string;
  /** Nome do arquivo (fim do caminho). */
  arquivo: string;
  caminho: string;
  local: LocalAnexoSenior;
  /** "aaaa-mm-dd" */
  anexadoEm: string | null;
  anexadoPor: string | null;
};

export function nomeDoArquivo(caminho: string): string {
  const partes = caminho.split(/[\\/]+/).filter(Boolean);
  return partes[partes.length - 1] ?? caminho;
}

export function localDoCaminho(caminho: string): LocalAnexoSenior {
  const c = caminho.trim();
  if (/^\\\\tsclient\\/i.test(c)) return "PC_DO_USUARIO";
  if (/^\\\\fs01s1p\\/i.test(c)) return "SERVIDOR_SENIOR";
  if (/^[a-z]:\\/i.test(c)) return "DRIVE_DA_SESSAO";
  return "OUTRO";
}

/** Nome comparavel: sem acento, sem maiuscula, espacos unificados. */
export const chaveNome = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** O anexo da Senior ja' esta' no dossie? Compara pelo nome do arquivo (ou pela descricao), que e' o nome que a pessoa sobe. */
export function jaNoDossie(a: Pick<AnexoSenior, "arquivo" | "descricao">, nomesNoDossie: string[]): boolean {
  const nomes = new Set(nomesNoDossie.map(chaveNome));
  return nomes.has(chaveNome(a.arquivo)) || (!!a.descricao.trim() && nomes.has(chaveNome(a.descricao)));
}
