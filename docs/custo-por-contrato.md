# Custo por Centro de Custo (`/custos/plano-de-contas`)

Tela dos gestores/coordenadores com o custo de cada centro de custo (CCU) por mês e por conta do plano financeiro, lido
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

## Reembolsáveis (18/10/2026)

Dois grupos próprios, nunca misturados com os tipos de custo normais:
- **Reembolsáveis · conta antiga** — conta 67 "Despesas Reembolsáveis" (onde está todo o histórico até set/2026) e a 179
  "Despesas Reembolsáveis BDI – INATIVA" (situação **I** no Senior, `E091PLF.SITFIN`; a tela avisa "inativa no Senior").
- **Reembolsáveis · contas R** — o plano novo "R - …" (contas 180–350). Cada conta R aparece na **sua própria linha**.
A classificação vem do plano do Senior; a conferência com Notas de Débito (jan–ago) confirmou o vínculo no CT 3687 e **não**
confirmou nos 3686 (PLT02/PMRE/BAQ) — ver o relatório de conferência. Inativas no Senior: 79, 146, 177, 179.

## Auditoria (somente leitura)

`GET /api/senior/custos-conta/sync?auditoria=1` (header `x-sync-key`): confere que cada célula (CCU × conta × mês) é a soma
exata dos lançamentos, totais por mês, lançamentos fora da Programação de Pagamento e centros de custo **sem equipe**
(sem equipe vinculada só ADMIN/DIRETOR/`verTodosCustos` enxergam; coordenadores só veem os CCUs das equipes de que participam).

## Acompanhamento e confer�ncia (18/10/2026)

- **Gr�ficos de acompanhamento** (vis�o geral e por centro de custo): linha mensal ou acumulada com m�dia dos meses fechados,
  m�dia m�vel de 3 meses e **meta mensal** (digitada pelo coordenador, guardada no navegador por CCU); varia��o contra o m�s
  anterior; **ponte** entre o m�s de refer�ncia e o anterior por tipo de custo (se o m�s est� em andamento, compara os dois
  �ltimos meses fechados); maiores altas e quedas por conta / centro de custo. O m�s em andamento fica sempre de fora da m�dia.
- **Exportar lan�amentos (Rel114)**: CSV t�tulo a t�tulo (`GET /api/custos-conta/lancamentos`), mesmos nomes de coluna do Rel114,
  para conferir com a planilha da �rea. Mesma regra de visibilidade da tela; "todos" s� para quem v� tudo.
- **Confer�ncia com o Rel114 oficial** (FPCP114 FILTROS MARCADOS.xls, todos os CCUs, mar�jul/26): 4.327 de 4.327 linhas do
  relat�rio est�o na tela, com o mesmo t�tulo, fornecedor, CCU, conta e valor. A tela tem 222 linhas a mais (R$ 300.980,52,
  3,2%): 97% delas s�o t�tulos com vencimento fora da janela do relat�rio (152 linhas / R$ 252.626,61 com o vencimento provis�rio
  30/12/2030 do Senior). Detalhe em `Conferencia_Custo_por_Centro_de_Custo_2026-10-18.xlsx`.
