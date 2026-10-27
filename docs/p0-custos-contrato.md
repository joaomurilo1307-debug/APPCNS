# P0 de custos do contrato (aba P0 > Custos de contrato)

O **P0** é a linha de base de custos de cada contrato: o **previsto, mês a mês**, que a área monta numa planilha (`P0 PREVISTO … DADOS PREVISTO`).
O sistema mostra esse previsto ao lado do **realizado do Senior** (aba Custos) e compara os dois. Nada é estimado: cada número é uma linha da
planilha da área, com a conta no nome do plano do Senior.

## O que entra e o que não entra

A planilha traz tudo. O sistema separa, na carga, em dois tipos (`P0Linha.tipo`):

| Tipo | O que é | Onde aparece |
|---|---|---|
| `CUSTO_CONTRATO` | o que entra no custo de contrato — **a mesma regra da aba Custos** (`src/lib/custos/planoContas.ts`): PJ, assistência médica, seguro, EPI/EPC, VA/VR, uniformes, contas “R - …” etc. | aba P0 > Custos de contrato e comparativo da aba Custos |
| `CUSTO_PESSOAL` | salário CLT, INSS, FGTS, férias, 13º e **provisões** (as contas que a regra tira do custo, mais a provisão por decisão do João, 27/10/2026) | guardado; aba P0 > Custos pessoais (vem depois). **Nunca é somado ao custo de contrato** |

Observação: a conta 77 “Provisões” **não** está na lista de contas excluídas do sistema (`CONTAS_EXCLUIDAS_BASE`). No P0 ela foi para `CUSTO_PESSOAL`
por decisão do João. Se o Senior lançar algo na conta 77 de um contrato, o realizado conta como custo e o P0 não conta — a diferença aparece no comparativo.

## Dados

- `P0Versao` (um por CCU e versão: original = 1, aditivos = 2, 3…) e `P0Linha` (conta, mês, valor, histórico). Só adiciona tabelas.
- Os P0 ficam em `prisma/data/p0/<ccu>_v<versao>.json` e entram no banco por `prisma/seed-p0.ts`, que roda no boot (`docker-entrypoint.sh`).
  **Só cria a versão que ainda não existe**; nunca sobrescreve nem apaga um P0 carregado. Aditivo = arquivo novo com `versao` maior (o sistema lê a ativa mais nova).
- Gerar o JSON de uma planilha: o script que separa custo × pessoal e padroniza a escrita (conta, grupo e código do plano do Senior) está na pasta de trabalho
  do Núcleo (`scratchpad/p0_separar_custo.py`, `p0_padrao_sistema.py`, `p0_exportar_json.py`).

## Telas

- **Contrato > P0 > Custos de contrato** (`src/components/p0/P0CustosContrato.tsx`): gráfico de acompanhamento do previsto (média, média móvel, realizado por cima),
  variação contra o mês anterior, desvio do realizado contra o P0, “o que variou” no P0, comparativo conta a conta, evolução por tipo de custo, representatividade e a tabela
  plano de contas × mês (clique na célula = linhas do P0 por trás do valor).
- **Contrato > Custos** (`VisaoContrato.tsx`): quando o contrato tem P0, entram a linha “P0 previsto” no gráfico, o KPI “Contra o P0”, as barras de desvio e o card
  **Comparativo com o P0** (logo abaixo de “O que variou”). Sem P0 cadastrado a tela fica como era.
- **/p0**: lista dos contratos e se o P0 já está cadastrado.

## Reembolsáveis (regra do comparativo — `src/lib/p0/comparar.ts`)

Até set/2026 o Senior lançava todo o reembolsável numa conta só (“Despesas Reembolsáveis”, conta antiga); agora há várias contas “R - …”, e o P0 já vem com elas. Em cada mês:

- realizado ainda na conta antiga (nenhuma conta R lançada no mês) → as contas R do P0 são **somadas** e comparadas com a conta única;
- realizado já nas contas R → compara **linha a linha**; o que ainda cair na conta antiga aparece à parte, “sem previsão”.

O critério vem do dado de cada mês, não de uma data digitada. Situações: acima do P0, abaixo, igual, sem previsão (realizado sem linha no P0) e não realizado (previsto sem realizado).
O mês em andamento compara só o já pago e fica fora das barras de desvio. Meses fora do período do P0 não têm comparação; um mês dentro do período sem linhas (pausa) tem previsto zero.

## Acesso

`GET /api/p0/custos`, `/api/p0/linhas` e `/api/p0/situacao` seguem a regra dos custos (`escopoDeCustos`/`podeVerCcu`): quem não vê os custos do contrato não vê o P0 (403).

## Testes

`tests/p0-comparacao.test.ts` (entra no `npm run test:financeiro`): soma de linhas, período, os dois modos de reembolsável, situações, casamento por código, mês fora do P0 e pausa, filtros e séries.
