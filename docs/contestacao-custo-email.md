# Contestação de custo: resposta por e-mail

Quem acompanha um contrato contesta um lançamento na tela **Ao vivo** (botão *Contestar*). O pedido vai por **e-mail** para a Mônica (coordenadora financeira) e para quem revisa no sistema, e ela responde **pelo próprio e-mail**, com um clique, sem precisar de usuário no sistema.

## O fluxo (e o que aparece na tela Ao vivo)

| Etapa | Quem faz | Status | Selo no lançamento (Ao vivo) |
|---|---|---|---|
| Contestou | quem acompanha o contrato | `PENDENTE` | Contestado · aguardando o financeiro |
| "OK, vou realocar no Senior" | Mônica (link do e-mail ou tela Aprovações) | `ACEITA` | Contestado · aceita, a realocar |
| "Já realocado no Senior" | Mônica | `REALOCADA` | **Realocado** |
| "Não concordo" (com motivo) | Mônica | `REJEITADA` | Contestado · rejeitada |

Do pendente também se vai direto para "Já realocado" ou "Não concordo"; da aceita só para "Já realocado". Realocado e rejeitada encerram. **O sistema não altera o Senior:** o ajuste do lançamento (centro de custo/conta) é feito pelo financeiro no Senior; aqui fica o andamento.

## O e-mail

Sai no ato da contestação (`enviarEmailDaContestacao`) com OC, título, fornecedor, valor, centro de custo, linha de custo, motivo, responsável indicado, nomes dos anexos e **três links**: OK / Já realocado / Não concordo. Destinatários: os e-mails da lista configurada (tela Aprovações) mais quem tem o módulo "Aprovar contestações de custo" (se ninguém tiver, os administradores). **A Mônica está na lista** (`prisma/seed-contestacoes-email.ts`, uma vez, sem tirar ninguém). O resultado do envio (para quem foi, ou por que não foi) fica gravado na contestação e aparece no cartão da tela Aprovações para o revisor.

## Os links

`/api/contestacoes/resposta?id=…&acao=ok|realocado|discordo&exp=…&t=…`, assinados com HMAC-SHA256 (`NEXTAUTH_SECRET`), válidos por 45 dias (`src/lib/contestacoesToken.ts`). Abrir o link **não decide nada** (só mostra o pedido e um botão *Confirmar*); quem decide é o botão. Adulterar a ação, o id ou a validade invalida o link. Repetir o clique é seguro. Quem decide por e-mail aparece como "O financeiro (resposta por e-mail)" (`decididoVia = e-mail`).

## Devolutiva

Cada etapa grava a decisão, **avisa dentro do sistema** quem contestou e o indicado (sino de notificações) e entra na auditoria (`contestacao.aceitar | realocar | rejeitar`). A tela Ao vivo mostra o selo da etapa no próprio lançamento. A tela Aprovações mostra cada contestação com o andamento e o botão *Já realocado* para quem revisa.

## Verificação do envio

No início do sistema, `prisma/seed-contestacoes-email.ts` manda **um e-mail de teste só para o João** e registra no log de inicialização se o servidor de e-mail aceitou ("e-mail de TESTE enviado" ou "NÃO saiu"). Tenta no máximo 3 vezes, 20 s cada.

## Testes e rollback

`tests/contestacao-fluxo.test.ts` (transições, links assinados, e-mail), mais `contestacoes*.test.ts`. Rollback: reverter o PR (as colunas novas ficam sem uso).
