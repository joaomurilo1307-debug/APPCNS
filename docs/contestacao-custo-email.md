# Contestação de custo: tela Contestações (pelo sistema) e resposta por e-mail

## A tela Contestações (`/contestacoes`, menu Contestações)

Tudo pelo sistema, **sem e-mail** e separado de Aprovações:

- **A Mônica (usuário próprio no sistema, com o módulo "Aprovar contestações de custo"; só o login dela no Senior é o antigo do Julimar)** vê as contestações de **todos**, muda a etapa (**OK, vou realocar** → **Já realocado no Senior**, ou **Rejeitar** com motivo) e escreve o **andamento** ("estou ajustando no Senior…"). O ajuste no Senior é feito por ela; aqui ela marca como realocado. O sistema não altera o Senior.
- **Cada pessoa** vê só as **suas** contestações (e as em que foi indicada), com o histórico, e pode mandar um recado para o financeiro.
- **Avisos pelo sino:** a cada decisão ou recado o outro lado é avisado, e o aviso abre a contestação na tela. Quem contestou vê também o selo da etapa no próprio lançamento da tela **Ao vivo** (clicar no selo abre a contestação).
- **Resumo e filtros:** contadores por etapa, "em andamento", busca (fornecedor, OC, título, contrato, pessoa), centro de custo e pessoa; as pendentes vêm primeiro (a que espera há mais tempo no topo). Atualiza sozinha a cada 1 minuto.
- **Histórico** (`ContestacaoEvento`): abertura, cada mudança de etapa e cada recado, com quem fez e quando. Contestações antigas, sem histórico, ganham a linha de abertura a partir dos próprios dados.
- Acesso à tela: módulos `contestacoes_custo`, `custos` ou `contratos`. A lista de e-mails que recebem o pedido fica numa seção recolhida (só administrador): "Envio por e-mail (a configurar depois)".
- O acesso de revisora do **usuário da Mônica** é garantido por seed de início (`prisma/seed-contestacoes-email.ts`, uma vez): ele lista no log os usuários com "Mônica" e só libera se houver exatamente um compatível (a coordenadora financeira, não a bióloga homônima). Ao liberar, retira o acesso de revisor que ficou no usuário do Julimar (quem saiu). O log de inicialização diz quem ficou LIBERADO.

Regras puras e testes: `src/lib/contestacoesTela.ts`, `tests/contestacoes-tela.test.ts`. API: `GET /api/contestacoes?visao=aprovacao`, `PATCH /api/contestacoes/[id]`, `POST /api/contestacoes/[id]/andamento`.

---

## Resposta por e-mail (a configurar depois: o servidor de e-mail ainda recusa o login do sistema)

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
