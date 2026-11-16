// Anexos do dossie ("Editar dossie"): tipo pelo conteudo, PDF com senha/corrompido recusado, montagem do PDF final e o
// ciclo no banco (incluir -> ler o dossie com os anexos -> remover). Banco: so' a base local de homologacao.
import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { LIMITES_ANEXO, conferirAnexo, incluirAnexo, lerPdfDoDossie, listarAnexos, montarPdfComAnexos, removerAnexo, tipoPeloConteudo } from "../src/lib/dossie/anexos";
import { prisma } from "../src/lib/prisma";
import { UPLOAD_DIR } from "../src/lib/uploadValidation";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/consominas_gestao_itau_homologacao", "Testes permitidos somente na base local exclusiva de homologacao.");

async function pdf(paginas: number, opcoes?: { useObjectStreams?: boolean }) {
  const d = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([300, 400]);
  return d.save(opcoes);
}

/** PNG RGB de verdade (largura x altura), sem biblioteca. */
function png(largura: number, altura: number): Uint8Array {
  const tabela = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = tabela[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([tam, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const linhas = Buffer.alloc((largura * 3 + 1) * altura, 0x7f);
  for (let y = 0; y < altura; y++) linhas[y * (largura * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhas)), bloco("IEND", Buffer.alloc(0))]));
}

test("Tipo pelo conteudo, nao pela extensao", async () => {
  assert.equal(tipoPeloConteudo(await pdf(1)), "application/pdf");
  assert.equal(tipoPeloConteudo(png(2, 2)), "image/png");
  assert.equal(tipoPeloConteudo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(tipoPeloConteudo(new TextEncoder().encode("MZ executavel")), null);
  assert.equal(tipoPeloConteudo(new TextEncoder().encode("lixo antes\n%PDF-1.4 ...")), "application/pdf");
});

test("Conferencia: PDF conta paginas; PNG = 1 pagina; vazio, grande, outro tipo, corrompido e com senha sao recusados", async () => {
  assert.deepEqual(await conferirAnexo(await pdf(2)), { tipo: "application/pdf", paginas: 2 });
  assert.deepEqual(await conferirAnexo(png(3, 2)), { tipo: "image/png", paginas: 1 });
  await assert.rejects(conferirAnexo(new Uint8Array()), /vazio/);
  await assert.rejects(conferirAnexo(new Uint8Array(LIMITES_ANEXO.bytesPorArquivo + 1)), /maior que 15 MB/);
  await assert.rejects(conferirAnexo(new TextEncoder().encode("planilha;csv")), /PDF, JPG ou PNG/);
  await assert.rejects(conferirAnexo(new TextEncoder().encode("%PDF-1.7\nnao e' um pdf de verdade")), /corrompido/);
  const comSenha = Buffer.from(await pdf(1, { useObjectStreams: false })).toString("latin1").replace("/Root", "/Encrypt 1 0 R\n/Root");
  await assert.rejects(conferirAnexo(new Uint8Array(Buffer.from(comSenha, "latin1"))), /protegido por senha/);
  await assert.rejects(conferirAnexo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])), /Imagem corrompida/);
});

test("PDF final: dossie + pagina com a lista + paginas de cada anexo; imagem larga vira pagina deitada; anexo sumido vira aviso", async () => {
  const base = await pdf(1);
  const agora = new Date("2026-11-11T15:00:00Z");
  const final = await montarPdfComAnexos(base, [
    { nome: "contrato assinado.pdf", tipo: "application/pdf", bytes: await pdf(2), criadoPorNome: "Gabriel", criadoEm: agora },
    { nome: "foto 📷 ação.png", tipo: "image/png", bytes: png(40, 20), criadoPorNome: null, criadoEm: agora },
    { nome: "sumiu.pdf", tipo: "application/pdf", bytes: null, criadoPorNome: "Ana", criadoEm: agora },
  ]);
  const doc = await PDFDocument.load(final);
  assert.equal(doc.getPageCount(), 1 + 1 + 2 + 1 + 1);
  const foto = doc.getPage(4).getSize();
  assert.ok(foto.width > foto.height, "imagem larga em pagina deitada");
  assert.equal((await PDFDocument.load(await montarPdfComAnexos(base, []))).getPageCount(), 1);
});

test("Banco: incluir anexos, ler o dossie com eles no fim, remover; limite de quantidade; apagar o dossie leva os anexos", async () => {
  const chave = `OC|1|TESTE-ANEXO-${Date.now()}`;
  await mkdir(path.join(UPLOAD_DIR, "dossies"), { recursive: true });
  const basePath = path.join("dossies", `${Date.now()}-base-teste.pdf`);
  await writeFile(path.join(UPLOAD_DIR, basePath), await pdf(3));
  const dossie = await prisma.dossieOC.create({ data: { chave, numOcp: "TESTE", codFil: "1", titulos: [], status: "PUBLICADO", arquivoPath: basePath, arquivoNome: "base.pdf" } });
  try {
    const a = await incluirAnexo(dossie.id, { nome: "boleto.pdf", bytes: await pdf(2) }, { id: null, nome: "Teste" });
    await incluirAnexo(dossie.id, { nome: "comprovante.png", bytes: png(10, 30) }, { id: null, nome: "Teste" });
    await assert.rejects(incluirAnexo(dossie.id, { nome: "nota.txt", bytes: new TextEncoder().encode("texto") }, {}), /PDF, JPG ou PNG/);
    assert.deepEqual((await listarAnexos(dossie.id)).map((x) => [x.nome, x.paginas, x.criadoPorNome]), [["boleto.pdf", 2, "Teste"], ["comprovante.png", 1, "Teste"]]);

    assert.equal((await PDFDocument.load(await lerPdfDoDossie(dossie))).getPageCount(), 3 + 1 + 2 + 1);

    const { caminho } = await prisma.dossieAnexo.findUniqueOrThrow({ where: { id: a.id } });
    await access(path.join(UPLOAD_DIR, caminho)); // gravado em disco
    assert.equal(await removerAnexo("outro-dossie", a.id), null); // anexo de outro dossie: nao mexe
    assert.equal((await removerAnexo(dossie.id, a.id))?.nome, "boleto.pdf");
    assert.equal((await PDFDocument.load(await lerPdfDoDossie(dossie))).getPageCount(), 3 + 1 + 1);
    await assert.rejects(access(path.join(UPLOAD_DIR, caminho)), "arquivo removido do disco");

    for (let i = (await listarAnexos(dossie.id)).length; i < LIMITES_ANEXO.arquivosPorDossie; i++) await prisma.dossieAnexo.create({ data: { dossieId: dossie.id, nome: `x${i}.pdf`, tipo: "application/pdf", caminho: "inexistente.pdf", bytes: 1, paginas: 1 } });
    await assert.rejects(incluirAnexo(dossie.id, { nome: "mais um.pdf", bytes: await pdf(1) }, {}), /limite/);
  } finally {
    await prisma.dossieOC.delete({ where: { id: dossie.id } });
  }
  assert.equal(await prisma.dossieAnexo.count({ where: { dossieId: dossie.id } }), 0);
});

test.after(async () => {
  await prisma.$disconnect();
});
