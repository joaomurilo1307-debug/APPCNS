import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { COMPONENTES, IDS_COMPONENTES, somarComponentes, totalComProLabore, totalDoGrupo, totalDoRito, zerar, type Componentes } from "../src/lib/custoPessoal/componentes";
import { mesesDasLinhas, mesesDoPeriodo, porCentroEMes, porMes, totalDoPeriodo, type LinhaCentroMes } from "../src/lib/custoPessoal/agregar";
import { CCUS_ADM, NOME_DO_NUCLEO, NUCLEOS_ADM } from "../src/lib/custoPessoal/escopo";
import { nomeBonito, situacaoTexto, tomDaSituacao } from "../src/lib/custoPessoal/formato";
import { problemasDaCarga, type ItemDaCarga } from "../src/lib/custoPessoal/validarCarga";
import { MODULOS, POR_ID, moduloPermitido, modulosEfetivos, nivelDoModulo, sobreposicoesParaGravar } from "../src/lib/acesso/catalogo";

const comp = (p: Partial<Componentes>): Componentes => ({ ...zerar(), ...p });
const linha = (codccu: string, mes: string, pessoas: number, p: Partial<Componentes>): LinhaCentroMes => ({ codccu, mes, pessoas, ...comp(p) });

test("total pela regra do Rito soma folha e provisoes e deixa o pro-labore de fora", () => {
  const c = comp({ liquido: 1000, rescisao: 100, inss: 80, fgts: 70, irrf: 10, provFerias: 50, provTerco: 16.67, prov13: 83.33, provInss: 30, provFgts: 20, proLabore: 1621 });
  assert.equal(totalDoRito(c), 1460);
  assert.equal(totalComProLabore(c), 3081);
  assert.equal(totalDoGrupo(c, "folha"), 1260);
  assert.equal(totalDoGrupo(c, "provisoes"), 200);
  assert.equal(totalDoGrupo(c, "prolabore"), 1621);
  assert.equal(totalDoRito(zerar()), 0);
});

test("todo componente tem rotulo, grupo e ajuda; a ordem do catalogo e' a das telas (folha, provisoes, pro-labore)", () => {
  assert.equal(COMPONENTES.length, 11);
  assert.deepEqual(new Set(COMPONENTES.map((c) => c.id)).size, 11);
  assert.ok(COMPONENTES.every((c) => c.rotulo && c.ajuda));
  assert.deepEqual(COMPONENTES.map((c) => c.grupo).filter((g, i, a) => a.indexOf(g) === i), ["folha", "provisoes", "prolabore"]);
  assert.ok(["provFerias", "provTerco", "prov13"].every((id) => IDS_COMPONENTES.includes(id as any)), "ferias, 1/3 de ferias e 13o aparecem separados");
});

test("somar componentes nao altera o original e arredonda em centavos", () => {
  const a = comp({ liquido: 0.1 });
  const b = somarComponentes(a, { liquido: 0.2, inss: 5 });
  assert.equal(b.liquido, 0.3);
  assert.equal(b.inss, 5);
  assert.equal(a.liquido, 0.1);
});

test("agregacao: centro x mes, total por mes e total do periodo", () => {
  const linhas = [
    linha("102265", "2026-08", 4, { liquido: 8755.71, inss: 1618.88, fgts: 1304.6, provFerias: 4290.23 }),
    linha("102265", "2026-09", 5, { liquido: 37992.15, inss: 1668.82, fgts: 820.25, provFerias: 4716.67 }),
    linha("390", "2026-09", 3, { proLabore: 4863 }),
  ];
  assert.deepEqual(mesesDasLinhas(linhas), ["2026-08", "2026-09"]);
  const mapa = porCentroEMes(linhas);
  assert.equal(mapa.get("102265")!.get("2026-09")!.total, 45197.89);
  assert.equal(mapa.get("390")!.get("2026-09")!.total, 0, "diretoria: so' pro-labore, nada na regra do Rito");
  assert.equal(mapa.get("390")!.get("2026-09")!.totalComProLabore, 4863);
  const meses = porMes(linhas, ["2026-08", "2026-09"]);
  assert.equal(meses.get("2026-09")!.pessoas, 8);
  assert.equal(meses.get("2026-09")!.totalComProLabore, 50060.89);
  const periodo = totalDoPeriodo([...meses.values()]);
  assert.equal(periodo.liquido, 46747.86);
  assert.equal(totalDoPeriodo([]).total, 0);
  assert.deepEqual(mesesDoPeriodo(["2026-03", "2026-04", "2026-05"], "2026-04", "2026-05"), ["2026-04", "2026-05"]);
});

test("escopo: 15 nucleos ADM, ADM MARKETING e' o 17 no sistema (21 no HCM) e centros de contrato ficam de fora", () => {
  assert.equal(NUCLEOS_ADM.length, 15);
  assert.equal(CCUS_ADM.size, 15);
  const mk = NUCLEOS_ADM.find((n) => n.nome === "ADM MARKETING")!;
  assert.equal(mk.codccu, "17");
  assert.equal(mk.ccuHcm, "21");
  assert.equal(NOME_DO_NUCLEO.get("260"), "ADM");
  assert.ok(!CCUS_ADM.has("210") && !CCUS_ADM.has("102335"), "centros de contrato nao entram");
  const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "nucleos_adm_listagem.json"), "utf-8")) as { name: string }[];
  assert.deepEqual([...NUCLEOS_ADM.map((n) => n.nome)].sort(), dados.map((d) => d.name).sort(), "os mesmos 15 nomes dos nucleos ADM do sistema");
});

test("nomes e situacao: titulo, preposicoes em minuscula, ferias em amarelo, desligado em vermelho", () => {
  assert.equal(nomeBonito("MARIA DAS GRAÇAS DA SILVA E SOUZA"), "Maria das Graças da Silva e Souza");
  assert.equal(nomeBonito("FERNANDA ARA�JO"), "Fernanda Arajo");
  assert.equal(nomeBonito(null), "");
  assert.equal(situacaoTexto("Trabalhando", ""), "");
  assert.equal(situacaoTexto("Férias", "13/10/2026"), "Férias desde 13/10/2026");
  assert.equal(tomDaSituacao("Férias"), "aviso");
  assert.equal(tomDaSituacao("Demitido"), "alerta");
  assert.equal(tomDaSituacao("Trabalhando"), "neutro");
});

const item = (p: Partial<ItemDaCarga> = {}): ItemDaCarga => ({ codccu: "102265", mes: "2026-09", matricula: "857", liquido: 2113.19, rescisao: 0, inss: 100, fgts: 80, irrf: 0, provFerias: 500, provTerco: 166.67, prov13: 500, provInss: 90, provFgts: 70, total: 3619.86, ...p });

test("carga: caminho feliz passa", () => {
  assert.deepEqual(problemasDaCarga(["2026-09"], [item(), item({ matricula: "858" })]), []);
});

test("carga: recusa mes fora da lista, centro que nao e' ADM, linha repetida e total que nao bate", () => {
  assert.equal(problemasDaCarga(["2026-08"], [item()]).length, 1);
  const naoAdm = problemasDaCarga(["2026-09"], [item({ codccu: "210" })]);
  assert.ok(naoAdm.some((p) => p.includes("não é ADM")));
  assert.ok(problemasDaCarga(["2026-09"], [item(), item()]).some((p) => p.includes("repetida")));
  assert.ok(problemasDaCarga(["2026-09"], [item({ total: 9999 })]).some((p) => p.includes("não bate")));
  assert.deepEqual(problemasDaCarga(["2026-09"], [item({ total: 3619.87 })]), [], "diferenca de 1 centavo e' arredondamento");
});

test("modulo custo_pessoal: exclusivo (nem ADMIN entra sozinho), liberado so' por linha gravada e nenhum papel entra por padrao", () => {
  const def = POR_ID.get("custo_pessoal")!;
  assert.ok(def && def.restrito && def.exclusivo && def.grupo === "pessoal", "grupo proprio: o time financeiro nao ganha salarios de brinde");
  for (const papel of ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"]) assert.equal(moduloPermitido(def, papel, new Map()), false, `${papel} nao entra sem liberacao`);
  for (const papel of ["ADMIN", "COLABORADOR"]) assert.equal(moduloPermitido(def, papel, new Map([["custo_pessoal", true]])), true, `${papel} entra quando liberado`);
  assert.equal(moduloPermitido(def, "ADMIN", new Map([["custo_pessoal", false]])), false, "bloqueio gravado vale ate para ADMIN");
  assert.ok(!modulosEfetivos("ADMIN", new Map()).includes("custo_pessoal"), "o menu do ADMIN nao mostra o modulo sem liberacao");
  assert.ok(modulosEfetivos("ADMIN", new Map([["custo_pessoal", true]])).includes("custo_pessoal"));
  assert.ok(modulosEfetivos("ADMIN", new Map()).includes("p0"), "os demais modulos continuam abertos ao ADMIN");
  assert.equal(nivelDoModulo(def, "ADMIN", new Map(), new Map()), null);
  assert.ok(MODULOS.filter((m) => m.id === "custo_pessoal").length === 1);
  assert.equal(POR_ID.get("p0")!.exclusivo, undefined, "so' o custo de pessoal e' exclusivo");
});

test("painel de acesso: salvar um ADMIN nao apaga a liberacao do modulo exclusivo e nao grava linhas dos outros modulos", () => {
  assert.deepEqual(sobreposicoesParaGravar("ADMIN", ["p0", "contratos"], {}), []);
  assert.deepEqual(sobreposicoesParaGravar("ADMIN", ["p0", "custo_pessoal"], { custo_pessoal: "VER" }), [{ modulo: "custo_pessoal", permitido: true, nivel: "VER" }]);
  assert.deepEqual(sobreposicoesParaGravar("COLABORADOR", ["custo_pessoal"], { custo_pessoal: "VER" }).filter((l) => l.modulo === "custo_pessoal"), [{ modulo: "custo_pessoal", permitido: true, nivel: "VER" }]);
});

test("acesso inicial: so' o Joao (nivel VER); Carolina, Andre e o DP tem a liberacao retirada; sem repetir pessoa", () => {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "acesso_custo_pessoal.json"), "utf-8")) as { modulo: string; nivel: string; pessoas: { chapa: string; nome: string; motivo: string }[]; revogar: { chapa: string; nome: string }[] };
  assert.ok(POR_ID.has(d.modulo));
  assert.equal(d.nivel, "VER");
  assert.deepEqual(d.pessoas.map((p) => p.chapa), ["2074"]);
  assert.ok(d.pessoas.every((p) => p.chapa && p.nome && p.motivo));
  assert.deepEqual(d.revogar.map((p) => p.chapa).sort(), ["1", "2", "22", "2094", "683"].sort());
  assert.ok(!d.revogar.some((r) => d.pessoas.some((q) => q.chapa === r.chapa)), "ninguem e' liberado e revogado ao mesmo tempo");
});
