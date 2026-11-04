# Vigia das cargas do Senior

## Por que existe
Os títulos a pagar e as OCs chegam por scripts externos (VPS do Rito + n8n) que enviam os dados para este sistema. Em 29/10/2026 a Renata trocou o domínio (`APP_DOMAIN` → `gestao.consominas.com.br`); os scripts continuavam enviando para o endereço antigo (404), o n8n mostrou "sucesso" e as telas ficaram ~140 min com dados velhos sem ninguém ser avisado.

## O que faz
A cada 10 min (junto do agendador interno em `src/lib/custos/agendador.ts`) o servidor olha a própria base:
- títulos: `max(TituloContasAPagar.atualizadoEm)`;
- OCs: `max(AprovacaoSenior.ultimaSincEm)`.

Se uma fonte passou de **45 min** sem carga (as cargas rodam a cada 10 min), cria uma notificação no sino para todos os usuários **ADMIN ativos**, com link para `/programacao-pagamento`. No máximo **1 aviso a cada 3 h por fonte**.

- Só vale **segunda a sábado, 06h–21h (São Paulo)**, a mesma janela do Custo por Contrato; fora disso nada é atraso.
- Base sem nenhuma carga conta como atraso ("nunca chegou carga").
- Nunca derruba o servidor: erro dentro do vigia é engolido.
- Código: `src/lib/vigia/sincronizacao.ts` (regra pura + `verificarCargas`). Testes: `tests/vigia-sincronizacao.test.ts`.

## O que NÃO cobre
- Se o próprio sistema estiver fora do ar ou o domínio não responder, o sino não aparece (ninguém consegue abrir). Para isso é preciso um vigia externo com canal de aviso (e-mail do sistema está sem login SMTP válido; ver `docs/contestacao-custo-email.md`).
- Não mede se os dados estão *certos*, só se estão *chegando*.

## Como desligar / reverter
Reverter o PR. Não há tabela nova nem variável de ambiente.
