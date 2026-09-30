// Traz da Senior (somente leitura) os titulos a pagar EM ABERTO, com os dados
// de pagamento do favorecido (banco/agencia/conta/PIX/CPF-CNPJ), e envia pro
// app via POST /api/senior/titulos-pagar/sync?modo=incremental -- esse modo
// nunca apaga nada e nao sobrescreve o que o Rito grava (ver a rota).
//
// Uso (app rodando, SENIOR_WS_SAPIENS_* e SENIOR_SYNC_KEY no .env):
//   npm run senior:sync                  # envia tudo pro app em APP_URL (padrao http://localhost:3000)
//   npm run senior:sync -- --simular     # so' consulta a Senior e mostra o resumo, sem enviar
//   npm run senior:sync -- --limite 50   # so' os 50 primeiros titulos (teste)
//   npm run senior:sync -- --titulo "TESTE REMESSA"   # atualiza so' esse titulo (rapido, qualquer situacao)
//   APP_URL=https://<producao> npm run senior:sync   # mesmo script contra outro app

import { consultarSenior, type LinhaSenior } from "../src/lib/senior/getDbInfo";
import {
  CAMPOS_CADASTRO_BANCARIO,
  CAMPOS_TITULO,
  escolherCadastroBancario,
  mapearTitulo,
  type ItemSyncTitulo,
} from "../src/lib/senior/mapeamentoTitulos";

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CHAVE = process.env.SENIOR_SYNC_KEY;
const SIMULAR = process.argv.includes("--simular");
const iTitulo = process.argv.indexOf("--titulo");
const TITULO = iTitulo >= 0 ? process.argv[iTitulo + 1] : null;
const iLimite = process.argv.indexOf("--limite");
const LIMITE = iLimite >= 0 ? Number(process.argv[iLimite + 1]) : Infinity;
const TAMANHO_LOTE = 200;

function contar(itens: ItemSyncTitulo[], campo: keyof ItemSyncTitulo): number {
  return itens.filter((i) => i[campo] !== null && i[campo] !== undefined).length;
}

async function main() {
  if (!SIMULAR) {
    if (!CHAVE) throw new Error("Defina SENIOR_SYNC_KEY no .env (a mesma chave do app).");
    const teste = await fetch(`${APP_URL}/api/senior/titulos-pagar/sync`, { headers: { "x-sync-key": CHAVE } }).catch(() => null);
    if (!teste || !teste.ok) {
      throw new Error(`O app nao respondeu em ${APP_URL} (ou a chave SENIOR_SYNC_KEY nao confere). Suba o app com "npm run dev" e tente de novo.`);
    }
  }

  let titulos: LinhaSenior[];
  let fornecedores: LinhaSenior[] = [];
  let cadastros: LinhaSenior[] = [];

  if (TITULO) {
    // Atualizacao rapida de um titulo so' (qualquer situacao -- inclusive se ja foi pago).
    console.log(`Consultando o titulo "${TITULO}" na Senior...`);
    titulos = await consultarSenior(`SELECT ${CAMPOS_TITULO.join(", ")} FROM E501TCP WHERE NUMTIT = '${TITULO.replace(/'/g, "''")}'`);
    console.log(`  ${titulos.length} titulo(s)`);
    for (const codigo of new Set(titulos.map((t) => t.CODFOR).filter((c) => /^\d+$/.test(c)))) {
      fornecedores.push(...(await consultarSenior(`SELECT CODFOR, NOMFOR, CGCCPF FROM E095FOR WHERE CODFOR = ${codigo}`)));
      cadastros.push(...(await consultarSenior(`SELECT ${CAMPOS_CADASTRO_BANCARIO.join(", ")} FROM E095HFO WHERE CODEMP = 1 AND CODFIL = 1 AND CODFOR = ${codigo}`)));
    }
  } else {
    console.log("Consultando titulos em aberto na Senior (leva ~1 min)...");
    titulos = await consultarSenior(`SELECT ${CAMPOS_TITULO.join(", ")} FROM E501TCP WHERE SITTIT = 'AB'`);
    console.log(`  ${titulos.length} titulos em aberto`);

    console.log("Consultando fornecedores...");
    fornecedores = await consultarSenior("SELECT CODFOR, NOMFOR, CGCCPF FROM E095FOR");
    console.log(`  ${fornecedores.length} fornecedores`);

    // E095HFO tem uma linha por fornecedor x empresa x filial (~19 mil no total,
    // e a contagem sozinha leva ~2 min); filtros tipo "CODBAN > 0" o parser da
    // Senior recusa ("Empty string"). Empresa/filial 1 = os titulos da Consominas;
    // a selecao por titulo (escolherCadastroBancario) cuida do resto.
    console.log("Consultando cadastro bancario dos fornecedores (E095HFO, empresa/filial 1 — leva ~2 min)...");
    cadastros = await consultarSenior(`SELECT ${CAMPOS_CADASTRO_BANCARIO.join(", ")} FROM E095HFO WHERE CODEMP = 1 AND CODFIL = 1`);
    console.log(`  ${cadastros.length} cadastros (${cadastros.filter((c) => c.CCBFOR && c.CCBFOR !== "0" && c.CCBFOR.trim() !== "").length} com conta)`);
  }
  const porCodigo = new Map(fornecedores.map((f) => [f.CODFOR, f]));
  const cadastrosPorFornecedor = new Map<string, LinhaSenior[]>();
  for (const c of cadastros) cadastrosPorFornecedor.set(c.CODFOR, [...(cadastrosPorFornecedor.get(c.CODFOR) ?? []), c]);

  const itens = titulos
    .map((t) =>
      mapearTitulo(t, porCodigo.get(t.CODFOR), escolherCadastroBancario(cadastrosPorFornecedor.get(t.CODFOR), t.CODEMP, t.CODFIL))
    )
    .filter((i): i is ItemSyncTitulo => i !== null)
    .slice(0, LIMITE);

  console.log(`\nResumo (${itens.length} titulos a enviar)`);
  console.log(`  com nome do fornecedor : ${contar(itens, "fornecedorNome")}`);
  console.log(`  com conta bancaria     : ${itens.filter((i) => i.bancoFavorecido && i.agenciaFavorecido && i.contaFavorecido && i.dacFavorecido).length} (completa) / ${contar(itens, "contaFavorecido")} (alguma parte)`);
  console.log(`  com chave PIX          : ${contar(itens, "chavePix")}`);
  console.log(`  com CPF/CNPJ favorecido: ${contar(itens, "documentoFavorecido")}`);
  console.log(`  com codigo de barras   : ${contar(itens, "codigoBarrasBoleto")}`);
  if (TITULO) {
    for (const i of itens) {
      console.log(
        `\n  titulo ${i.numTit} (filial ${i.codFil}, fornecedor ${i.codFor}): situacao ${i.situacao}, pago=${i.pago}, ` +
          `emissao ${i.dataEmissao}, venc. original ${i.vencimentoOriginal}, venc. programado ${i.vencimentoProgramado}, ` +
          `valor ${i.valorOriginal} / em aberto ${i.valorAberto}`
      );
    }
  }

  if (SIMULAR) {
    console.log("\n--simular: nada foi enviado.");
    return;
  }

  let processados = 0;
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const lote = itens.slice(i, i + TAMANHO_LOTE);
    const resposta = await fetch(`${APP_URL}/api/senior/titulos-pagar/sync?modo=incremental`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-key": CHAVE! },
      body: JSON.stringify({ itens: lote }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(`O app recusou o lote ${i / TAMANHO_LOTE + 1}: ${JSON.stringify(corpo).slice(0, 400)}`);
    processados += corpo.processados ?? 0;
    console.log(`  lote ${i / TAMANHO_LOTE + 1}: ${corpo.processados} ok (${processados}/${itens.length})`);
  }
  console.log(`\nConcluido: ${processados} titulos sincronizados em ${APP_URL}.`);
}

main().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
});
