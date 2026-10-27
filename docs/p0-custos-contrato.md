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

## P0 carregados

| CCU | Contrato | Fonte | Custo de contrato (R$) | Custos pessoais (R$) |
|---|---|---|---:|---:|
| 210 | MRN CT 3686/2023 + MRN CT 3687/2023 (3686 e 3687 analisados juntos no mesmo centro de custo; **v2**) | P0 3686 + P0 3687 | 10.045.548,84 | 9.394.443,61 |
| 230 | MRN CT 3687 LT (**v2**: só o LT) | P0 3687 LT | 8.049.034,43 | 1.259.968,54 |
| 102335 | MRN CT 4337/2026 | controle de custos de 16/10/2026, aba “DADOS PREVISTO - P0” | 11.771.791,33 | 18.182.642,58 |
| 102345 | MRN CT 4343/2026 | P0 4343 PMRE | 12.844.088,67 | 1.555.784,43 |
| 102385 | MRN CT 4362/2026 | P0 4362 PLT02 | 5.616.316,25 | 783.306,16 |
| 102395 | MRN CT 4353/2026 - BIOTA | P0 4353 BAQ | 4.180.890,24 | 1.128.155,56 |

A v1 do 210 (só o 3686) e a do 230 (3687 + LT juntos, de 27/10) continuam no banco como histórico; o sistema lê a versão ativa mais nova (v2). A divisão da v2 segue a tabela da Denise, confirmada pela diretoria em 28/10/2026 (3686 + 3687 → 210; 3687 LT → 230). **Rollback da v2:** `UPDATE "P0Versao" SET ativa = false WHERE codccu IN ('210','230') AND versao = 2;` (volta a v1). Atenção ao comparar: no Senior a medição (receita) do contrato 3687 vai toda para o CCU 230.

**Nome que aparece no sistema:** o CCU 210 aparece como “MRN CT 3686 + 3687” e o CCU 230 como “MRN CT 3687 LT” (no Senior eles se chamam “MRN CT 3686/2023” e “MRN CT 3687/2023”; o Senior não é alterado). A troca está em `src/lib/contratos/nomesDeExibicao.ts` (usada por Medição, Previsão, Ao vivo e contestações via `nomesDosCentros`, e pela lista de centros por área) e, no banco, em `prisma/seed-nomes-contratos.ts` (roda no boot; só troca o que ainda está com o nome antigo do Senior, então um nome editado na ficha fica). Aprovação de OC e Programação de Pagamento continuam mostrando o nome do Senior, porque mostram o que está lá.

O 4337 é diferente dos demais: o previsto vem em **parcelas lineares** (1/36 por mês, 36 meses) e 32 contas sem previsão foram completadas com a **média realizada do CT 3581** (R$ 409.221,97, 1,4% do total; o histórico de cada linha diz “COMPLEMENTO MARCO 0”). A conta “Serviços Geotécnicos / Laboratório” (complemento) não existe no plano do Senior: entra com `codConta` nulo e grupo `semplano` (“Sem correspondência no plano do Senior”), casa pelo nome e nunca terá realizado por código. “Depreciação - Veículos” é negativa (−R$ 1.465.661,88) e, pela regra do sistema, fica no custo de contrato. Os valores têm frações de centavo e são guardados com a precisão da planilha; a tela arredonda por conta e mês, então o total na tela fica R$ 0,59 acima do da planilha.

## Telas

- **Contrato > P0 > Custos de contrato** (`src/components/p0/P0CustosContrato.tsx`): abre com o **hero** (`HeroP0.tsx`: faixa dos meses do P0 — fechados, mês em andamento e por vir — e três medidores: prazo, previsto que já venceu e realizado × previsto) e **atalhos fixos** de seção (`NavSecoesP0.tsx`). Depois: gráfico de acompanhamento do previsto (média, média móvel, realizado por cima),
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
