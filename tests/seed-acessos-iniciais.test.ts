import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULOS, PERFIS_PRONTOS } from "../src/lib/acesso/catalogo";
import { chaveNome, escolherPorPalavra, escolherUsuario } from "../prisma/achar-usuario";

const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "acessos_iniciais.json"), "utf-8"));
const idsDoCatalogo = MODULOS.filter((m) => m.grupo !== "admin").map((m) => m.id as string);

test("seed de acessos: lista de modulos do seed = catalogo (sem os de administracao)", () => {
  assert.deepEqual([...dados.todosOsModulos].sort(), [...idsDoCatalogo].sort());
});

test("seed de acessos: perfis do seed iguais aos perfis prontos do painel", () => {
  const catalogo = (id: string) => PERFIS_PRONTOS.find((p) => p.id === id)!.modulos as string[];
  assert.deepEqual([...dados.perfis.visao_total].sort(), [...catalogo("visao_total")].sort());
  assert.deepEqual([...dados.perfis.membro_projetos].sort(), [...catalogo("membro_projetos")].sort());
  const restritos = MODULOS.filter((m) => m.grupo === "financeiro").map((m) => m.id as string);
  assert.deepEqual([...dados.perfis.financeiro].sort(), [...restritos].sort(), "financeiro = todo o grupo financeiro restrito");
});

test("seed de acessos: perfis de nucleo iguais ao painel; coordenacao financeira = gestao + todo o financeiro, sem contratos", () => {
  const catalogo = (id: string) => PERFIS_PRONTOS.find((p) => p.id === id)!.modulos as string[];
  assert.deepEqual([...dados.perfis.gerente_nucleo].sort(), [...catalogo("gerente_nucleo")].sort());
  assert.deepEqual([...dados.perfis.coordenador_nucleo].sort(), [...catalogo("coordenador_nucleo")].sort());
  const cf = dados.perfis.coordenacao_financeira as string[];
  for (const m of dados.perfis.financeiro) assert.ok(cf.includes(m), `coordenacao financeira precisa de ${m}`);
  const julimar = dados.pessoas.find((p: any) => p.palavraNoNome === "JULIMAR");
  assert.equal(julimar.perfil, "coordenacao_financeira");
  assert.deepEqual([...julimar.bloquear].sort(), ["contratos", "custos", "medicao", "previsao", "p0"].sort());
  for (const m of julimar.bloquear) assert.ok(!cf.includes(m), `${m} nao pode estar liberado`);
  for (const perfil of ["gerente_nucleo", "coordenador_nucleo"]) for (const m of ["programacao_pagamento", "pagamentos_itau", "conferencia_oc", "aprovacoes_oc_todas"]) assert.ok(!dados.perfis[perfil].includes(m), `${perfil} nao pode ter ${m}`);
});

test("seed de acessos: marca por pessoa e perfil (a Claudia recebe tres aplicacoes sem se confundirem)", () => {
  const marcas = dados.pessoas.map((p: any) => `${p.chapa}${p.marca ? "." + p.marca : ""}`);
  assert.equal(new Set(marcas).size, marcas.length);
  assert.equal(dados.pessoas.filter((p: any) => p.chapa === "46").length, 3, "financeiro, gerente de nucleo e completo");
});

test("seed de acessos: nenhuma chapa repetida sem marca e todo perfil existe", () => {
  const chapas = dados.pessoas.map((p: any) => `${p.chapa}${p.marca ?? ""}`);
  assert.equal(new Set(chapas).size, chapas.length);
  for (const p of dados.pessoas) assert.ok(dados.perfis[p.perfil], `perfil ${p.perfil}`);
});

test("seed: so' o financeiro tem as telas de pagamento; Denise (visao total) e membros nao", () => {
  const pag = ["programacao_pagamento", "pagamentos_itau", "conferencia_oc"];
  for (const perfil of ["visao_total", "membro_projetos"]) for (const m of pag) assert.ok(!dados.perfis[perfil].includes(m), `${perfil} nao pode ter ${m}`);
});

test("achar usuario: nome completo unico, nome curto cadastrado, e duvida devolve null", () => {
  const us = [
    { id: "1", name: "Renata Marinho" },
    { id: "2", name: "Gabriel Furst" },
    { id: "3", name: "Gabriel Silva" },
    { id: "4", name: "André Peres" },
    { id: "5", name: "Andre Carreira Bruinje" },
  ];
  assert.deepEqual(escolherUsuario(us, "RENATA REIS MARINHO"), { id: "1", via: "nome-curto" });
  assert.deepEqual(escolherUsuario(us, "GABRIEL FURST FARIA"), { id: "2", via: "nome-curto" });
  assert.deepEqual(escolherUsuario(us, "ANDRE SILVA PERES"), { id: "4", via: "nome-curto" });
  assert.equal(escolherUsuario(us, "GABRIEL TAYLOR SATURNINO LUIZ"), null, "so' o primeiro nome igual nao basta");
  assert.equal(escolherUsuario([...us, { id: "6", name: "Renata M" }], "RENATA REIS MARINHO")?.id, "1");
  assert.equal(escolherUsuario([{ id: "7", name: "Maria Silva" }, { id: "8", name: "MARIA SILVA" }], "Maria Silva"), null, "nome igual repetido: nao chuta");
  assert.equal(chaveNome("João  Murilo"), "JOAO MURILO");
});

test("seed de acessos: acesso completo so' para as 6 pessoas indicadas; pagamento so' em financeiro, completo e coordenacao financeira", () => {
  assert.deepEqual([...dados.perfis.completo].sort(), [...dados.todosOsModulos].sort());
  const completos = dados.pessoas.filter((p: any) => p.perfil === "completo").map((p: any) => p.chapa).sort();
  assert.deepEqual(completos, ["1", "2", "2074", "2155", "2174", "46"].sort());
  const pag = ["programacao_pagamento", "pagamentos_itau", "conferencia_oc"];
  for (const [perfil, mods] of Object.entries(dados.perfis) as [string, string[]][]) {
    const temPagamento = pag.some((m) => mods.includes(m));
    assert.equal(temPagamento, ["financeiro", "completo", "coordenacao_financeira"].includes(perfil), `perfil ${perfil}`);
  }
  // Bruno e Samara: visao_total sem "ver todos os contratos" (o Joao escolhe os contratos no painel)
  for (const chapa of ["23", "25"]) {
    const e = dados.pessoas.find((p: any) => p.chapa === chapa && p.perfil === "visao_total");
    assert.ok(e && e.verTodosContratos === undefined && e.escopoProjetos === "NUCLEO", `chapa ${chapa}`);
  }
});

test("achar por palavra: so' quando ha um unico cadastro com a palavra (caso Julimar/Monica)", () => {
  assert.deepEqual(escolherPorPalavra([{ id: "1", name: "Julimar Santos" }, { id: "2", name: "Renata Marinho" }], "JULIMAR"), { id: "1", via: "palavra" });
  assert.equal(escolherPorPalavra([{ id: "1", name: "Julimar Santos" }, { id: "2", name: "Julimar Alves" }], "JULIMAR"), null);
  assert.equal(escolherPorPalavra([{ id: "2", name: "Renata Marinho" }], "JULIMAR"), null);
});
