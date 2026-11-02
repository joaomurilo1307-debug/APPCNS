import { test } from "node:test";
import assert from "node:assert/strict";
import { bloqueiaEscrita } from "../src/lib/acesso/somenteLeitura";

test("Diretor Master: toda chamada que grava e' barrada (dado de gestao, financeiro, usuarios, projetos)", () => {
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    for (const caminho of ["/api/pagamentos-itau/remessas", "/api/titulos-pagar/vinculo", "/api/projects", "/api/tasks/abc", "/api/users", "/api/contratos/190", "/api/senior/aprovacoes/123/pagamento", "/api/custos-conta/acessos"]) {
      assert.equal(bloqueiaEscrita("DIRETOR_MASTER", metodo, caminho), true, `${metodo} ${caminho}`);
    }
  }
});

test("Diretor Master: leitura (GET, HEAD, OPTIONS) passa em qualquer rota", () => {
  for (const metodo of ["GET", "HEAD", "OPTIONS"]) assert.equal(bloqueiaEscrita("DIRETOR_MASTER", metodo, "/api/pagamentos-itau/remessas"), false);
});

test("Diretor Master: chat, calendario, presenca, login, o proprio perfil e arquivos de exportacao continuam liberados", () => {
  for (const caminho of ["/api/auth/signout", "/api/presence/heartbeat", "/api/messages/direct", "/api/messages/team/xyz", "/api/events", "/api/events/abc", "/api/event-attendees/1", "/api/users/me", "/api/users/me/acesso", "/api/completar-cadastro", "/api/upload",
    "/api/titulos-pagar/exportar-pacote", "/api/conferencia-oc/dossies-zip", "/api/custos-conta/atualizar", "/api/medicao/atualizar", "/api/dossies/gerar"]) {
    assert.equal(bloqueiaEscrita("DIRETOR_MASTER", "POST", caminho), false, caminho);
  }
});

test("prefixo parecido nao libera: /api/users/meus e /api/messagesX seguem barrados; /api/users/<id> tambem", () => {
  for (const caminho of ["/api/users/meus", "/api/messagesX", "/api/users/cm123", "/api/eventsfake", "/api/uploads"]) assert.equal(bloqueiaEscrita("DIRETOR_MASTER", "PATCH", caminho), true, caminho);
});

test("os demais papeis nao sao afetados, nem sem papel", () => {
  for (const papel of ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "COORDENADOR", "COLABORADOR", "VISUALIZADOR", "CLIENTE", "", null, undefined]) {
    assert.equal(bloqueiaEscrita(papel as any, "POST", "/api/pagamentos-itau/remessas"), false, String(papel));
  }
});
