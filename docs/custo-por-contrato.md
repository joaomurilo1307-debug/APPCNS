# Custo por Centro de Custo (`/custos/plano-de-contas`)

Tela dos gestores/coordenadores com o custo de cada centro de custo (CCU) por mês e por conta do plano financeiro, lido
**direto do Senior**. Desde 17/10/2026 não depende mais da foto mensal do Rito de Gestão. Ninguém digita custo: o realizado
vem sozinho do Senior; o que antes vivia nas planilhas dos coordenadores (previsto, responsável, objeto) é migrado para o sistema.

## Regra do número — versão 2 (18/10/2026)

`custo = Σ E501RAT.VLRRAT` das linhas de rateio **de baixa que quita uma nota**, isto é, cuja própria transação
(`E501RAT.CODTNS`) é:

| Transação | Significado | Entra? |
|---|---|---|
| **90550** | Baixa de título por **pagamento** | sim — forma `PAGAMENTO` |
| **90558** | Baixa de título **por adiantamento** (a nota foi quitada com um adiantamento já dado ao fornecedor) | sim — forma `ADIANTAMENTO` |
| 90555 | Baixa do título de **adiantamento** (ADT) — é o espelho exato do 90558 | **não** (contaria em dobro) |
| 90500/90501/90505/90517/90522 | Entrada (nota lançada) | não |
| 90503 | Entrada de **previsão** | não |
| 90530 / 90534 | Adiantamento dado a fornecedor / devolução a fornecedor | não |
| 90553 / 90557 | Cancelamento | não |

Agrupado por **CCU + conta financeira + MESANO** (mês do pagamento), sem as contas que já entram em Pessoal/Impostos.
Em 2026, no Senior inteiro: 90558 = R$ 194.974,41 (196 linhas) e 90555 = R$ 194.974,41 — os dois lados são idênticos, por isso só um conta.

Por que mudou da v1 (só 90550, chave `NUMTIT+CODFIL+CODFOR+SEQMOV` no `E501MCP`): conferindo 16 planilhas de coordenadores
contra o Senior, as notas pagas por adiantamento (ex.: R$ 78.571,12 do PLT02 em maio) faltavam na tela e estavam nas planilhas.
A v2 dá **exatamente o mesmo resultado da v1 para o 90550** (4.112 de 4.112 células; R$ 16.506.439,52) e só acrescenta o 90558.
Ela também não depende de juntar com o `E501MCP` para decidir o que é custo: usa o `CODTNS` da própria linha de rateio e a chave
inclui o **tipo do título** (`CODTPT`), o que elimina a colisão NFS × ADT (mesmo número, fornecedor e sequência em tipos diferentes).
O `E501MCP` só fornece a data real do pagamento.

Contas fora do custo: 81 Salários, 70 FGTS, 72 INSS, 73 IRRF Colaboradores, 80 Rescisão, 71 GRRF, 69 Férias, 55 13º,
150 PCC, 151 IRRF retido, 167 ISSQN, 162 Antecipação de lucros — **e as contas "R - …" que espelham essas** (o plano novo
de reembolsáveis, contas 180–350, é um espelho exato do antigo: `clafin R = "217" + clafin antigo sem o 1º dígito`;
derivado em `src/lib/custos/planoContas.ts`, não digitado).

O mês em andamento mostra só o que já foi pago. **Título lançado e ainda não pago não entra** (pode ser previsão); não há tela de "a pagar".

## Duas formas de ver o mês (botão "Ver por")

- **Data de pagamento** (padrão): cada parcela entra no mês em que foi paga. É a que **bate com a coluna DATA COMPETÊNCIA das
  planilhas**: em 3.143 de 3.144 linhas conferidas a competência da planilha é o mês do pagamento.
- **Competência**: a compra inteira entra no mês da competência da nota, mesmo que as parcelas sejam pagas depois. A competência é a
  **competência fiscal cadastrada pelo financeiro no título** (`E501TCP.USU_COMFIS`, igual em todas as parcelas da compra); na falta
  dela, o mês do rateio de entrada do título. Cerca de 35% do valor cai em mês diferente entre as duas visões.
  Os campos de competência do título só são preenchidos de forma consistente nos títulos de 2026 em diante (90% dos de 2026).

Na gaveta de lançamentos aparecem sempre as duas datas (pago em / competência) e o selo **adiantamento** nas notas quitadas por adiantamento.

## Como atualiza

- Botão **Atualizar** no topo da tela → `POST /api/custos-conta/atualizar` dispara em segundo plano e responde na hora.
- Ao abrir a tela com dados de mais de 45 min, ela dispara sozinha uma vez; além disso o agendador interno atualiza a cada ~2 h.
- Agendadores externos (n8n): `POST /api/senior/custos-conta/atualizar` com o header `x-sync-key`. Estado: `GET` nas duas rotas.
- Uma por vez; no máximo uma leitura a cada 2 min. Leva alguns minutos (cada CCU e a competência dos títulos passam pela fila única
  do `consultarSenior`, nunca em paralelo — o GetDBInfo penaliza consultas simultâneas).
- Cada execução fica em `AtualizacaoCusto` (status, etapa, progresso, resumo com totais por mês, CCUs novos, contas novas, adiantamentos).

## Segurança

- Só **lê** o Senior. Se a leitura falhar, vier vazia ou gerar menos da metade das linhas já gravadas, **nada é gravado**.
- Backups no schema `backup` (fora do alcance do `prisma db push`): na 1ª gravação direta do Senior
  (`custo_conta_financeira_pre_senior_direto`, `custo_financeiro_detalhe_pre_senior_direto`) e **antes da regra v2**
  (`custo_conta_financeira_pre_regra_v2`, `custo_financeiro_detalhe_pre_regra_v2`).
- Enquanto existir uma execução `OK`, os envios antigos do Rito (`/api/senior/custos-conta/sync` e
  `/api/senior/custo-financeiro-detalhe/sync`) são **ignorados**.

## Rollback

- **Da regra v2 para a v1** (só 90550): restaurar as duas tabelas do backup `*_pre_regra_v2`:
  `TRUNCATE "CustoContaFinanceira"; INSERT INTO "CustoContaFinanceira" SELECT * FROM backup.custo_conta_financeira_pre_regra_v2;`
  e o mesmo para `CustoFinanceiroDetalhe` (as colunas novas ficam nulas); depois reverter o commit da v2 para a próxima atualização
  não reaplicar o 90558.
- Devolver o comando ao Rito: `DELETE FROM "AtualizacaoCusto" WHERE status = 'OK';`.

## Reembolsáveis

Dois grupos próprios: **conta antiga** (67 e 179 inativa) e **contas R** (plano novo 180–350, cada uma na sua linha).
Inativas no Senior: 79, 146, 177, 179.

## Auditoria (somente leitura)

`GET /api/senior/custos-conta/sync?auditoria=1` (header `x-sync-key`): confere que cada célula (CCU × conta × mês) é a soma
exata dos lançamentos, totais por mês e centros de custo **sem equipe**.

## Conferência com as planilhas dos coordenadores (18/10/2026)

16 planilhas "CONTROLE DE CUSTOS" × tela, jan/26 até o último mês de cada planilha: 3.180 de 3.244 linhas casam por fornecedor,
valor e data. As diferenças restantes são da planilha (lançamentos duplicados, lançamentos manuais sem pagamento na CT 3687,
rateios de faturas compartilhadas não lançados) — detalhe em `Conferencia_Planilhas_Controle_de_Custos_x_Sistema_2026-10-18.xlsx`.
O relatório da planilha ("Análise das Previsões") é Previsto × Realizado por pacote > conta; o **pacote** é o cabeçalho de nível 2 do
plano financeiro do Senior (148 de 148 contas conferidas).

## Gráficos

Paleta categórica (cor segue o **grupo** de contas, nunca o ranking do momento): `#0e9f94, #eb6834, #2a78d6, #eda100,
#6b4fd0, #e87ba4` + cinza `#9aa5b1` para "demais grupos". Todo valor também aparece em rótulo, dica e tabela.
No gráfico de variação contra o mês anterior, **clicar numa barra** escolhe o mês analisado: a ponte e as maiores altas/quedas
por conta passam a comparar aquele mês com o anterior (o balão de cada barra já mostra a conta que mais subiu e a que mais caiu).

## Pagos / semana (03/11/2026)

Tabela abaixo do "Ao vivo" (tela do centro de custo e visao geral): o que foi **pago** nos dias escolhidos do mes, titulo a titulo e centro de custo a centro de custo. Substitui o relatorio semanal (Rel114 do Senior) que a Grazi/Cris recebiam.

- **Dias:** escolhe-se o mes e um ou varios dias (clique; Shift marca uma faixa). Sem dia marcado = mes todo. A grade mostra quantos pagamentos ha em cada dia.
- **Pago =** baixa lancada no Senior (`CustoFinanceiroDetalhe`, a mesma base e regra v2 do custo: 90550 + 90558, data = data do pagamento) **ou** pagamento confirmado pelo retorno do Itau (item de remessa `PAGO`, titulo ainda em aberto no Senior: selo "Pago pelo banco · falta a baixa no Senior").
- **So' aparece o que foi pago (decisao do Joao, 03/11/2026):** titulo programado, enviado ao banco sem retorno, agendado, rejeitado ou cancelado NAO entra na tabela. Na tela de um centro de custo so' aparecem as linhas daquele centro (o calculo abre o rateio completo do titulo).
- **Uma linha = uma linha de rateio** do pagamento (como no Rel114, que repete cada linha n x n vezes: aqui cada uma aparece uma vez). `Valor` e' so' o do centro de custo da linha; `Total pago` e' a soma de todos os centros do pagamento; "Calculo" mostra o rateio completo (centro da linha marcado), a conta `total x % = valor` e se a soma fecha com o total.
- **OC e aprovacoes:** mesmo vinculo titulo-OC do Ao vivo; aprovacoes de `AprovacaoSenior.historicoNiveis` (nivel, aprovador, data).
- **Acesso:** o do Ao vivo (so' os centros liberados para a pessoa; o rateio completo mostra todos os centros do titulo, como na OC).
- **Atualizacao:** a tabela rele o que o sistema tem a cada 3 minutos; quando as baixas lidas do Senior passam de 20 minutos pede a mesma atualizacao do botao "Atualizar" (uma por vez). Baixas sao lancadas com data do passado (ex.: baixa lancada em 19/10 com data 28/09): a tabela usa a data do pagamento.
- **Excel:** baixa o que o filtro mostra (abas Pagos e Rateios completos).
- **API:** `GET /api/custos-conta/pagos?mes=aaaa-mm&dias=1,5,9-12&ccu=&situacao=todos|pago|pago_banco&q=`. Codigo: `src/lib/contratos/pagosPorDia.ts` (puro), `pagosPorDiaServidor.ts` (banco), `src/components/custos/PagosPorDia.tsx`; testes `tests/pagos-por-dia.test.ts`.
- **Validacao (25/09 a 07/10, 5 centros MRN):** a planilha da Grazi (58 linhas distintas, R$ 270.494,05) = baixado no Senior R$ 155.731,06 (30 linhas) + aberto no Senior R$ 114.679,29 (27 linhas, NAO aparecem: nao foram baixadas) + duplicidade 62666$01 R$ 83,70; a tabela traz ainda 4 baixas que a planilha nao tinha (R$ 4.080,88), lancadas no Senior depois do relatorio.
