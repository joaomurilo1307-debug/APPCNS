// Anexos da OC na Senior (E000ANX) mostrados no "Editar dossiê": onde o arquivo esta', nome do arquivo, ordem e a marca
// "ja' no dossiê". Linhas reais da Senior de 25/11/2026 (usuarios trocados por nomes ficticios).
import assert from "node:assert/strict";
import test from "node:test";
import { chaveNome, jaNoDossie, localDoCaminho, nomeDoArquivo } from "../src/lib/dossie/anexosSenior";
import { paraAnexosSenior } from "../src/lib/senior/anexosOc";

const nomes = new Map([
  ["159", "comprador.um"],
  ["174", "comprador.dois"],
  ["194", "comprador.tres"],
]);

test("local do arquivo pelo caminho gravado na Senior", () => {
  assert.equal(localDoCaminho("\\\\FS01S1P\\Consominas_Diversos$\\Logística\\11.2026\\SILLION_NF _16355.pdf"), "SERVIDOR_SENIOR");
  assert.equal(localDoCaminho("\\\\fs01s1p\\I230824162927$\\x.pdf"), "SERVIDOR_SENIOR");
  assert.equal(localDoCaminho("Z:\\HSE\\CST_ 435,6.pdf"), "DRIVE_DA_SESSAO");
  assert.equal(localDoCaminho("\\\\tsclient\\WebFile\\Untitled Extract Pages.pdf"), "PC_DO_USUARIO");
  assert.equal(localDoCaminho("https://exemplo/x.pdf"), "OUTRO");
});

test("nome do arquivo e' o fim do caminho", () => {
  assert.equal(nomeDoArquivo("Z:\\HSE\\CST_ 435,6.pdf"), "CST_ 435,6.pdf");
  assert.equal(nomeDoArquivo("\\\\FS01S1P\\Consominas_Diversos$\\Suprimentos\\OC 16595 - MERCADO LIVRE\\Boleto OC 16595.pdf"), "Boleto OC 16595.pdf");
  assert.equal(nomeDoArquivo("sem-pasta.pdf"), "sem-pasta.pdf");
});

test("OC 16595: tres anexos na ordem de inclusao, com quem anexou e a data; descricao cortada em 50 nao atrapalha", () => {
  const pasta = "\\\\FS01S1P\\Consominas_Diversos$\\Suprimentos\\OC 16595 - MERCADO LIVRE - FILTRO 6 TOMADAS\\";
  const linhas = [
    { SEQANX: "3", DESANX: "NF 1911605 - NEXBROS ECOMMERCE E IMPORTACAO LTDA.p", LOCANX: `${pasta}NF 1911605 - NEXBROS ECOMMERCE E IMPORTACAO LTDA.pdf`, DATGER: "25/11/2026", USUGER: "194" },
    { SEQANX: "1", DESANX: "Justificativa OC 16595.pdf", LOCANX: `${pasta}Justificativa OC 16595.pdf`, DATGER: "10/11/2026", USUGER: "174" },
    { SEQANX: "2", DESANX: "Boleto OC 16595.pdf", LOCANX: `${pasta}Boleto OC 16595.pdf`, DATGER: "10/11/2026", USUGER: "174" },
  ];
  const a = paraAnexosSenior(linhas, nomes);
  assert.deepEqual(
    a.map((x) => [x.seq, x.arquivo, x.anexadoPor, x.anexadoEm, x.local]),
    [
      [1, "Justificativa OC 16595.pdf", "comprador.dois", "2026-11-10", "SERVIDOR_SENIOR"],
      [2, "Boleto OC 16595.pdf", "comprador.dois", "2026-11-10", "SERVIDOR_SENIOR"],
      [3, "NF 1911605 - NEXBROS ECOMMERCE E IMPORTACAO LTDA.pdf", "comprador.tres", "2026-11-25", "SERVIDOR_SENIOR"],
    ],
  );
  // A NF sobe com o nome inteiro do arquivo: casa pelo nome, mesmo com a descricao cortada.
  assert.equal(jaNoDossie(a[2], ["NF 1911605 - NEXBROS ECOMMERCE E IMPORTACAO LTDA.pdf"]), true);
  assert.equal(jaNoDossie(a[0], ["NF 1911605 - NEXBROS ECOMMERCE E IMPORTACAO LTDA.pdf"]), false);
});

test("usuario sem cadastro, data vazia e linha sem caminho", () => {
  const [a, b] = paraAnexosSenior(
    [
      { SEQANX: "1", DESANX: "CST_ 435,6.pdf", LOCANX: "Z:\\HSE\\CST_ 435,6.pdf", DATGER: "31/12/1900", USUGER: "216" },
      { SEQANX: "2", DESANX: "so descricao.pdf", LOCANX: "", DATGER: "19/11/2026", USUGER: "0" },
      { SEQANX: "3", DESANX: "", LOCANX: "", DATGER: "", USUGER: "" },
    ],
    nomes,
  );
  assert.deepEqual([a.anexadoPor, a.anexadoEm, a.local], ["usuário 216 da Senior", null, "DRIVE_DA_SESSAO"]);
  assert.deepEqual([b.arquivo, b.caminho, b.anexadoPor, b.local], ["so descricao.pdf", "", null, "OUTRO"]);
  assert.equal(paraAnexosSenior([{ SEQANX: "3", DESANX: "", LOCANX: "", DATGER: "", USUGER: "" }], nomes).length, 0);
});

test("'ja' no dossiê': nome do arquivo sem diferenca de maiuscula, acento ou espaco", () => {
  const sillion = { arquivo: "SILLION_NF _16355.pdf", descricao: "SILLION_NF _16355.pdf" };
  assert.equal(jaNoDossie(sillion, ["sillion_nf  _16355.PDF"]), true);
  assert.equal(jaNoDossie(sillion, ["SILLION_NF_16355.pdf"]), false); // nome diferente: continua "falta anexar"
  assert.equal(jaNoDossie({ arquivo: "Logística.pdf", descricao: "" }, ["Logistica.pdf"]), true);
  assert.equal(jaNoDossie({ arquivo: "a.pdf", descricao: "Nota do frete.pdf" }, ["nota do frete.pdf"]), true);
  assert.equal(jaNoDossie({ arquivo: "a.pdf", descricao: " " }, [" "]), false);
  assert.equal(chaveNome("  Ação  NF.pdf "), "acao nf.pdf");
});
