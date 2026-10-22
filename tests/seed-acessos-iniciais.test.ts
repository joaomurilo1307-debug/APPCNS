import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULOS, PERFIS_PRONTOS } from "../src/lib/acesso/catalogo";
import { chaveNome, escolherUsuario } from "../prisma/achar-usuario";

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

test("seed de acessos: nenhuma chapa repetida e todo perfil existe", () => {
  const chapas = dados.pessoas.map((p: any) => p.chapa);
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
