import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULOS,
  PAPEIS_DO_SISTEMA,
  PERFIS_PRONTOS,
  POR_ID,
  lerSobreposicoes,
  moduloPermitido,
  modulosEfetivos,
  sobreposicoesParaGravar,
  type ModuloId,
} from "../src/lib/acesso/catalogo";

const nenhuma = new Map<string, boolean>();
const FINANCEIRO_RESTRITO: ModuloId[] = ["programacao_pagamento", "pagamentos_itau", "conferencia_oc", "despesas_recorrentes", "alertas_financeiro", "notas_fiscais", "aprovacoes_oc_todas"];

test("catalogo: ids unicos e cada modulo tem rota", () => {
  const ids = MODULOS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(MODULOS.every((m) => m.href.startsWith("/")));
});

test("financeiro restrito: nenhum papel entra sem liberacao, nem DIRETOR, GESTOR_PROJETO ou APROVADOR", () => {
  for (const papel of ["DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR", "CLIENTE"]) {
    for (const id of FINANCEIRO_RESTRITO) assert.equal(moduloPermitido(POR_ID.get(id)!, papel, nenhuma), false, `${papel} nao deveria entrar em ${id}`);
  }
});

test("financeiro restrito: ADMIN entra sempre; quem recebeu liberacao entra, qualquer que seja o papel", () => {
  for (const id of FINANCEIRO_RESTRITO) assert.equal(moduloPermitido(POR_ID.get(id)!, "ADMIN", nenhuma), true);
  const liberada = new Map([["conferencia_oc", true]]);
  assert.equal(moduloPermitido(POR_ID.get("conferencia_oc")!, "COLABORADOR", liberada), true);
  assert.equal(moduloPermitido(POR_ID.get("pagamentos_itau")!, "COLABORADOR", liberada), false, "liberar um nao libera os outros");
});

test("modulos comuns seguem o papel como antes", () => {
  assert.equal(moduloPermitido(POR_ID.get("contratos")!, "COLABORADOR", nenhuma), true);
  assert.equal(moduloPermitido(POR_ID.get("equipes")!, "COLABORADOR", nenhuma), false);
  assert.equal(moduloPermitido(POR_ID.get("equipes")!, "GESTOR_PROJETO", nenhuma), true);
  assert.equal(moduloPermitido(POR_ID.get("tarefas")!, "APROVADOR", nenhuma), false);
  assert.equal(moduloPermitido(POR_ID.get("aprovacoes_oc")!, "COLABORADOR", nenhuma), false);
  assert.equal(moduloPermitido(POR_ID.get("aprovacoes_oc")!, "APROVADOR", nenhuma), true);
});

test("bloqueio gravado vence o padrao do papel", () => {
  const bloqueado = new Map([["contratos", false]]);
  assert.equal(moduloPermitido(POR_ID.get("contratos")!, "GESTOR_PROJETO", bloqueado), false);
  assert.equal(moduloPermitido(POR_ID.get("contratos")!, "ADMIN", bloqueado), true, "ADMIN nao se bloqueia");
});

test("administracao nao se libera por pessoa", () => {
  const tentou = new Map([["usuarios", true]]);
  assert.equal(moduloPermitido(POR_ID.get("usuarios")!, "DIRETOR", tentou), false);
  assert.equal(moduloPermitido(POR_ID.get("usuarios")!, "ADMIN", nenhuma), true);
});

test("sobreposicoesParaGravar: ida e volta deixa a pessoa exatamente com os modulos pedidos, para todo papel e todo perfil", () => {
  for (const papel of PAPEIS_DO_SISTEMA) {
    for (const perfil of PERFIS_PRONTOS) {
      const gravar = sobreposicoesParaGravar(papel, perfil.modulos);
      const efetivos = modulosEfetivos(papel, lerSobreposicoes(gravar));
      if (papel === "ADMIN") {
        assert.deepEqual(gravar, []);
        continue;
      }
      assert.deepEqual([...efetivos].sort(), [...perfil.modulos].sort(), `${papel} + ${perfil.id}`);
    }
  }
});

test("sobreposicoesParaGravar: so' grava a diferenca (padrao do papel nao gera linha)", () => {
  const padraoColab = modulosEfetivos("COLABORADOR", nenhuma);
  assert.deepEqual(sobreposicoesParaGravar("COLABORADOR", padraoColab), []);
  const gravar = sobreposicoesParaGravar("COLABORADOR", [...padraoColab, "conferencia_oc"]);
  assert.deepEqual(gravar, [{ modulo: "conferencia_oc", permitido: true }]);
});

test("lerSobreposicoes ignora modulo que nao existe mais", () => {
  const m = lerSobreposicoes([{ modulo: "antigo", permitido: true }, { modulo: "contratos", permitido: false }]);
  assert.equal(m.size, 1);
  assert.equal(m.get("contratos"), false);
});

test("perfis prontos: usam so' modulos do catalogo; membro de projetos e coordenador nao tem financeiro; financeiro tem todos os restritos", () => {
  for (const p of PERFIS_PRONTOS) for (const id of p.modulos) assert.ok(POR_ID.has(id), `${p.id}: ${id}`);
  const por = (id: string) => PERFIS_PRONTOS.find((p) => p.id === id)!;
  for (const id of ["membro_projetos", "coordenador_nucleo", "gerente_nucleo", "aprovador"]) {
    for (const f of FINANCEIRO_RESTRITO) assert.ok(!por(id).modulos.includes(f), `${id} nao pode ter ${f}`);
  }
  for (const f of FINANCEIRO_RESTRITO) assert.ok(por("financeiro").modulos.includes(f));
  assert.equal(por("membro_projetos").escopoProjetos, "PROPRIOS");
  assert.equal(por("gerente_nucleo").escopoProjetos, "NUCLEO");
});
