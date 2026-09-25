// Descoberta SOMENTE LEITURA na Senior: mostra os campos reais de um titulo e
// do fornecedor dele, pra descobrir em que coluna moram o codigo de barras do
// boleto e os dados bancarios. Nao grava nada na Senior nem no app.
//
// Uso (na pasta do projeto, com SENIOR_WS_SAPIENS_USER/PASSWORD no .env):
//   npm run senior:descobrir
//   npm run senior:descobrir -- "NUMERO DO TITULO" 126400
//
// A saida tambem vai para senior-descobrir-saida.txt (sem senha) -- e' so'
// dizer "leia o arquivo" na conversa, sem copiar do terminal.

import { writeFileSync } from "node:fs";
import { consultarSenior, type LinhaSenior } from "../src/lib/senior/getDbInfo";

const numTit = process.argv[2] ?? "TESTE REMESSA";
const codFor = Number(process.argv[3] ?? 126400);

const saida: string[] = [];
function log(texto: string) {
  console.log(texto);
  saida.push(texto);
}

function vazio(valor: string): boolean {
  return valor === "" || /^0([.,]0+)?$/.test(valor) || valor === "31/12/1900";
}

function mostrar(titulo: string, linhas: LinhaSenior[]) {
  log(`\n=== ${titulo} — ${linhas.length} linha(s) ===`);
  linhas.slice(0, 3).forEach((linha, i) => {
    if (linhas.length > 1) log(`-- linha ${i + 1}`);
    for (const [campo, valor] of Object.entries(linha)) {
      if (!vazio(valor)) log(`${campo.padEnd(14)} ${valor}`);
    }
  });
  // O SELECT * devolve TODAS as colunas, inclusive as vazias -- listar os nomes
  // mostra onde o dado moraria mesmo quando este registro nao o preencheu.
  if (linhas.length > 0) {
    const nomes = Object.keys(linhas[0]);
    log(`\ncolunas (todas, ${nomes.length}): ${nomes.join(" ")}`);
    const candidatas = nomes.filter((n) => /BAR|BAN|AGE|CCB|CTA|FAV|PIX|CGC|LIN|DIG|BOL/.test(n));
    log(`candidatas (barras/banco/agencia/conta/favorecido/boleto): ${candidatas.join(" ") || "nenhuma"}`);
  }
}

async function tentar(titulo: string, sql: string) {
  try {
    mostrar(titulo, await consultarSenior(sql));
  } catch (e: any) {
    log(`\n=== ${titulo} — FALHOU ===\n${e.message}`);
  }
}

async function main() {
  log(`Consultando a Senior: titulo "${numTit}", fornecedor ${codFor} (somente leitura)`);
  await tentar(`E501TCP — titulo "${numTit}"`, `SELECT * FROM E501TCP WHERE NUMTIT = '${numTit.replace(/'/g, "''")}'`);
  await tentar(`E095FOR — fornecedor ${codFor}`, `SELECT * FROM E095FOR WHERE CODFOR = ${codFor}`);
  log("\nPronto.");
  writeFileSync("senior-descobrir-saida.txt", saida.join("\n"), "utf8");
  console.log("Saida gravada em senior-descobrir-saida.txt");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
