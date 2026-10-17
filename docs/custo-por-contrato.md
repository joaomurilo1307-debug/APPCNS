# Custo por Contrato (`/custos/plano-de-contas`)

Tela dos gestores com o custo de cada contrato (centro de custo) por mês e por conta do plano financeiro, lido
**direto do Senior**. Desde 17/10/2026 não depende mais da foto mensal do Rito de Gestão.

## Regra do número (validada)

`custo = Σ E501RAT.VLRRAT` das linhas de rateio cuja chave **(NUMTIT, CODFIL, CODFOR, SEQMOV)** tem baixa real em
`E501MCP` (`CODTNS = 90550`), agrupado por **CCU + conta financeira + MESANO** (mês de competência), sem as contas que já
entram em Pessoal/Impostos. A chave **inclui CODFOR** (NUMTIT sozinho colide entre fornecedores).

Contas fora do custo: 81 Salários, 70 FGTS, 72 INSS, 73 IRRF Colaboradores, 80 Rescisão, 71 GRRF, 69 Férias, 55 13º,
150 PCC, 151 IRRF retido, 167 ISSQN, 162 Antecipação de lucros — **e as contas "R - …" que espelham essas** (o plano novo
de reembolsáveis, contas 180–350, é um espelho exato do antigo: `clafin R = "217" + clafin antigo sem o 1º dígito`;
derivado em `src/lib/custos/planoContas.ts`, não digitado).

Conferência feita em 17/10/2026:
- Motor TypeScript × script Python no Senior ao vivo: 4.112 de 4.112 linhas (CCU×conta×mês) idênticas.
- × relatório do Rito de 23/09 (jan–ago): jan e mar–jul batem ao centavo, total e por CCU. As únicas diferenças são CCUs
  que a lista fixa do Rito nunca puxou (102045, 380, 102395, 102405, 102415, 102425); o motor novo lê todos os CCUs do E044CCU.
- CT 3748 / CCU 190: jan 28.657,06 · fev 28.015,73 · mar 27.787,04 · abr 25.152,98.

O mês em andamento mostra só o que já foi pago (baixado). Título lançado e ainda não pago **não** entra — é a regra do
relatório. (Uma visão "a pagar" separada é possível, mas é outra métrica; não está nesta tela.)

## Como atualiza

- Botão **Atualizar** no topo da tela → `POST /api/custos-conta/atualizar` dispara em segundo plano e responde na hora.
- Ao abrir a tela com dados de mais de 45 min, ela dispara sozinha uma vez.
- Agendadores externos (n8n): `POST /api/senior/custos-conta/atualizar` com o header `x-sync-key` (mesma chave dos outros
  `/api/senior/*`). Estado: `GET` nas duas rotas.
- Uma por vez; no máximo uma leitura a cada 2 min. Leva ~4 min (a leitura das baixas e de cada CCU passa pela fila única
  do `consultarSenior`, nunca em paralelo — o GetDBInfo penaliza consultas simultâneas).
- Cada execução fica em `AtualizacaoCusto` (status, etapa, progresso, resumo com totais por mês, CCUs novos, contas novas).

## Segurança

- Só **lê** o Senior. Se a leitura falhar, vier vazia ou gerar menos da metade das linhas já gravadas, **nada é gravado**.
- Antes da primeira gravação copia as duas tabelas para o schema `backup`
  (`backup.custo_conta_financeira_pre_senior_direto`, `backup.custo_financeiro_detalhe_pre_senior_direto`) — fora do
  alcance do `prisma db push` do entrypoint.
- Enquanto existir uma execução `OK`, os envios antigos do Rito (`/api/senior/custos-conta/sync` e
  `/api/senior/custo-financeiro-detalhe/sync`) são **ignorados** (senão sobrescreveriam números novos com a foto mensal).

## Rollback

1. Devolver o comando ao Rito: `DELETE FROM "AtualizacaoCusto" WHERE status = 'OK';` — a próxima cascata mensal volta a gravar.
2. Restaurar os dados antigos já: `TRUNCATE "CustoContaFinanceira"; INSERT INTO "CustoContaFinanceira" SELECT * FROM backup.custo_conta_financeira_pre_senior_direto;` e o mesmo para `CustoFinanceiroDetalhe`.
3. Código: reverter o commit desta funcionalidade (a tela antiga lia o mesmo formato de dados).

## Gráficos

Paleta categórica (cor segue o **grupo** de contas, nunca o ranking do momento): `#0e9f94, #eb6834, #2a78d6, #eda100,
#6b4fd0, #e87ba4` + cinza `#9aa5b1` para "demais grupos". Validada com o validador do método (separação para daltonismo
≥ 12,8; piso em visão normal ≥ 26,9). Amarelo e rosa ficam abaixo de 3:1 sobre branco, por isso todo valor também aparece
em rótulo, dica e tabela. Mapa de calor: um tom só (teal da marca).
