# Busca de títulos e OCs na Senior feita pelo próprio sistema

Atualização: 12/11/2026.

## Por que mudou

Até 11/11/2026, quem buscava os títulos a pagar e as ordens de compra na Senior era uma cadeia externa:

1. o botão "Atualizar agora" (ou o agendamento de 10 em 10 minutos) chamava um webhook do **n8n**;
2. o n8n entrava por **SSH** num servidor externo (VPS) e rodava dois scripts Python (`sincronizar_titulos_pagar.py` e `sincronizar_aprovacoes_senior.py`);
3. os scripts liam a Senior com uma **credencial própria**, guardada no VPS, e mandavam o retrato para `POST /api/senior/titulos-pagar/sync` e `POST /api/senior/aprovacoes/sync`.

A tela esperava um tempo fixo (90 s, 15 s ou 150 s, conforme a tela) e anunciava "lista atualizada" **sem saber se algo tinha chegado**. Qualquer elo quebrado deixava os dados velhos em silêncio: em 29/10 os scripts mandavam para o domínio antigo (HTTP 404), e em 11/11 a credencial da Senior mudou sem que a cópia do VPS fosse atualizada.

## Como funciona agora

O sistema lê a Senior direto, com a mesma credencial que o dossiê já usa (`SENIOR_WS_SAPIENS_USER`/`PASSWORD`), em segundo plano:

- **Botão "Atualizar agora"** (Programação de Pagamento, Aprovações, Aprovações de OC, mapa da OC, Pagamentos Itaú): começa a busca e acompanha até ela terminar. Mostra a etapa ("títulos: lendo títulos pagos (7/23) · 1 min 20 s") e, no fim, quantos títulos/OCs foram gravados — ou o motivo exato da falha (Senior fora do ar, credencial recusada, tempo esgotado). Clicar de novo no meio de uma busca acompanha a que já está rodando.
- **Busca automática** de 10 em 10 minutos (só produção): títulos e depois OCs; a próxima rodada começa 10 min depois do fim da anterior. `SENIOR_SYNC_AUTO=0` desliga; `SENIOR_SYNC_INTERVALO_MIN` muda o intervalo (mínimo 5).
- **Títulos em dois modos.** O histórico inteiro de pagos leva uns 15 minutos na Senior (medido em 12/11/2026: só os pagos do tipo NFS, 4.846 linhas, levam 2 a 4 minutos por tentativa), e quase nada dele muda. Por isso:
  - **rápida** (botão e rodadas de 10 min, 1–2 min): títulos em aberto, títulos nas demais situações e, pelo número, os que o sistema tinha fora de "pago" e saíram dessas listas (foram pagos ou excluídos). Grava sem limpeza geral; apaga só os que sumiram da Senior (no máximo 200 de uma vez).
  - **completa** (histórico inteiro com limpeza): roda quando nunca rodou, quando a última tem mais de 24 h ou, de madrugada (1h–5h), quando tem mais de 12 h. Título que já nasce pago na Senior só aparece depois dela.
- A busca em segundo plano não usa a fila de consultas das telas (uma consulta de vários minutos não pode segurar o dossiê ou a conferência): no máximo duas chamadas à Senior ao mesmo tempo, como quando a busca rodava no VPS.
- **"Sincronizado do Senior em"** da Programação de Pagamento passa a ser o fim da última busca concluída (antes era a maior data de alteração de qualquer título, que mudava até com revisão manual).

Código: `src/lib/senior/sincronizacao/` — `titulos.ts` e `aprovacoes.ts` (leitura + gravação), `usuarios.ts` (de-para E099USU), `pessoasAtivas.ts` (desligados), `execucao.ts` (uma busca por fonte, estado, novas tentativas), `agendador.ts`, `cliente.ts` (acompanhamento na tela). Estado em `SincronizacaoSenior` (uma linha por fonte), lido por `GET /api/senior/sincronizacao`.

## O que é igual aos scripts e o que mudou de propósito

As consultas, os campos e as regras são um porte fiel dos dois scripts (comparado item a item com os scripts originais rodando sobre as mesmas respostas da Senior). Mudanças de propósito:

- **Nada parcial é gravado.** Uma consulta que falha (depois de até 3 tentativas para falha passageira) interrompe a busca e os dados anteriores continuam. O script de títulos pulava o tipo que falhava e a gravação apagava os títulos desse tipo; o de OCs gravava OC sem rateio/nível.
- **Títulos pagos de tipo novo** entram por uma consulta "todos os outros tipos" (a lista de tipos do script era fixa).
- **A limpeza do que sumiu roda depois dos upserts** e fica suspensa se for apagar mais de 10% (mínimo 500) de uma vez — sinal de leitura incompleta, não de cancelamento.
- **Nome da conta financeira** do rateio da OC vem da Senior (E091PLF), como no dossiê; o script lia de um banco do VPS.
- **Desligados** (para não pedir aprovação a quem saiu): a folha (R034FUN, HCM/Rubi) tem credencial própria, `SENIOR_WS_HCM_USER`/`PASSWORD`. Com ela, a lista é lida e guardada (`RosterAtivoSenior`); sem ela, vale a última lista guardada ou, na falta, os desligados que a sincronização anterior já marcou nas OCs — desligamentos novos só são detectados com a credencial da folha configurada.

## Convivência com o n8n

As rotas `POST /api/senior/*/sync` continuam aceitando o envio externo, com a mesma gravação e numa trava compartilhada (as duas origens nunca gravam ao mesmo tempo). Depois de conferir a busca nova em produção, **desligue os dois workflows do n8n** ("Sergio - Titulos a Pagar (Sync)" e "Aprovacoes OC (Sync)"): até lá, a Senior recebe as consultas em dobro.

## Validação

- `tests/senior-sincronizacao.test.ts`: regras do título (saldo, OC pelo USU_NUMOCP, conta de outra empresa, CPF sem o zero, boleto), pedaços por tipo, falha interrompendo tudo, novas tentativas, NIVEXI, nível compartilhado (OC 3184) e por centro (OC 15354), desligados, lista de pessoas (folha, guardada, marcados), limpeza suspensa e o ciclo de uma busca (falha registrada sem gravar, sucesso com quantidade e horário).
- Paridade: leitura nova na Senior real (só leitura) com cada resposta gravada; os scripts Python originais rodados sobre as mesmas respostas, sem rede; comparação item a item.
