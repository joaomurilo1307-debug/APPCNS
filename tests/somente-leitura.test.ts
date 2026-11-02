import { test } from "node:test";
import assert from "node:assert/strict";
import { bloqueiaEscrita } from "../src/lib/acesso/somenteLeitura";

test("Acesso Master: fora de Projetos toda chamada que grava e' barrada (contratos, custo, financeiro, usuarios, nucleos)", () => {
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    for (const caminho of ["/api/pagamentos-itau/remessas", "/api/titulos-pagar/vinculo", "/api/users", "/api/users/cm123", "/api/contratos/190", "/api/senior/aprovacoes/123/pagamento", "/api/custos-conta/acessos", "/api/nucleos/abc", "/api/p0/linhas", "/api/contestacoes"]) {
      assert.equal(bloqueiaEscrita("ACESSO_MASTER", metodo, caminho), true, `${metodo} ${caminho}`);
    }
  }
});

test("Acesso Master: na parte de Projetos ele edita (projetos, tarefas, demandas, aprovacoes, metas, PDI, equipes de projeto)", () => {
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const caminho of ["/api/projects", "/api/projects/abc", "/api/projects/abc/approve", "/api/tasks", "/api/tasks/abc", "/api/task-dependencies/1", "/api/tarefas/resumo", "/api/teams/x", "/api/demandas/y/comentarios",
      "/api/approval-requests/z", "/api/goals", "/api/contract-goals/g1", "/api/pdi/1", "/api/pdi-items/2", "/api/attachments/3", "/api/projetos-acesso"]) {
      assert.equal(bloqueiaEscrita("ACESSO_MASTER", metodo, caminho), false, `${metodo} ${caminho}`);
    }
  }
});

test("Acesso Master: leitura (GET, HEAD, OPTIONS) passa em qualquer rota", () => {
  for (const metodo of ["GET", "HEAD", "OPTIONS"]) assert.equal(bloqueiaEscrita("ACESSO_MASTER", metodo, "/api/pagamentos-itau/remessas"), false);
});

test("Acesso Master: chat, calendario, presenca, login, o proprio perfil e arquivos de exportacao continuam liberados", () => {
  for (const caminho of ["/api/auth/signout", "/api/presence/heartbeat", "/api/messages/direct", "/api/messages/team/xyz", "/api/events", "/api/events/abc", "/api/event-attendees/1", "/api/users/me", "/api/users/me/acesso", "/api/completar-cadastro", "/api/upload",
    "/api/titulos-pagar/exportar-pacote", "/api/conferencia-oc/dossies-zip", "/api/custos-conta/atualizar", "/api/medicao/atualizar", "/api/dossies/gerar"]) {
    assert.equal(bloqueiaEscrita("ACESSO_MASTER", "POST", caminho), false, caminho);
  }
});

test("prefixo parecido nao libera: /api/users/meus, /api/messagesX, /api/projectsX e /api/tasksX seguem barrados", () => {
  for (const caminho of ["/api/users/meus", "/api/messagesX", "/api/eventsfake", "/api/uploads", "/api/projectsX", "/api/tasksX", "/api/teamsX"]) assert.equal(bloqueiaEscrita("ACESSO_MASTER", "PATCH", caminho), true, caminho);
});

test("os demais papeis nao sao afetados, nem sem papel", () => {
  for (const papel of ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "COORDENADOR", "COLABORADOR", "VISUALIZADOR", "CLIENTE", "", null, undefined]) {
    assert.equal(bloqueiaEscrita(papel as any, "POST", "/api/pagamentos-itau/remessas"), false, String(papel));
  }
});
