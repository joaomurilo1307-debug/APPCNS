# Resultado Operacional

Tela **Resultado Operacional** (`/resultado-operacional`, menu "Resultado Operacional") e aba **Resultado** de cada contrato (`/contratos/<ccu>?aba=resultado`, a última aba). Mostra quanto a empresa, cada área e cada contrato ganham: **receita − custos**, mês a mês, com os mesmos motores das telas de Receita e Medição e de Custo por Centro de Custo. Nada é digitado.

## A conta

| Linha | O que é | De onde vem |
|---|---|---|
| Receita bruta | medição faturada em NF + notas de débito + medido ainda sem nota | Receita e Medição (`conciliacao.ts`), pelos pedidos do contrato |
| (−) Retenções | impostos retidos pelo cliente nas notas (PIS, COFINS, CSLL, IRRF, ISS…): NF bruta − NF líquida; ND não tem | mesma conciliação (`retencoes`) |
| = Receita líquida | | |
| (−) Custos | custo realizado do CC no Senior (baixas 90550 + 90558; sem as contas de pessoal e imposto) | Custo por Centro de Custo (`/api/custos-conta`, mesmos filtros e base pagamento/competência) |
| (−) Custo de pessoal | folha CLT + encargos + provisões (+ pró-labore da diretoria) | `CustoPessoalMes`, **só com o módulo restrito `custo_pessoal`** |
| = **Resultado operacional** | margem = resultado ÷ receita considerada | |

- Filtro **Receita: Líquida | Bruta**: líquida desconta as retenções (padrão, como o Rito); bruta não desconta nada.
- Visão **Empresa** desconta dos contratos a **estrutura administrativa** (centros `ADMINISTRATIVO`: custos e pessoal). **Só contratos**, **Engenharia** e **Ambiental** não incluem a estrutura.
- **210 + 230** (confirmado pelo João em 27/10/2026): o custo do 3687 está no 210 e a receita do 3687 no 230; juntos (`CENTROS_JUNTOS`, padrão) mostram o resultado real. Dá para separar.
- Período padrão: janeiro ao **último mês fechado** (e, com pessoal, até onde a folha está carregada). O mês em andamento aparece hachurado e fica fora das comparações; meses sem folha avisam que o resultado está sem pessoal.

## Diferença conhecida para o Rito de Gestão

O Rito (`rito_financeiro.resultado_por_ccu`) calcula **margem real = (faturamento líquido + notas de débito) − (custo financeiro + impostos + custo de pessoal)**, e o faturamento líquido do Rito desconta uma alíquota sobre **todo** o faturamento (no CT 3748 o líquido é 77,85% do bruto em jan–abr/2026), não só as retenções das notas (6,15% na AGA MSG, p.ex.). Por isso o resultado desta tela é **maior** que a margem real do Rito. O custo financeiro e o de pessoal batem com o Rito (CCU 190: pessoal 63.945,17 em jan, 69.195,52 em fev, 97.300,06 em mar, 85.859,03 em abr; custo financeiro de abril 25.152,98). **Decisão pendente com o financeiro:** qual alíquota de imposto sobre o faturamento entra aqui. Enquanto isso, a tela diz isso em "Como o resultado é calculado" e a opção **Bruta** mostra o resultado sem desconto algum.

## Acesso

- Página: módulo `medicao` (layout). API: `medicao` + `custos`, com o mesmo escopo por centro de custo e o mesmo filtro de área do topo das outras telas.
- **Custo de pessoal** só vai para quem tem o módulo exclusivo `custo_pessoal` (`podePessoal`); sem ele o campo `pessoal` vai `null` e o resultado é "antes do pessoal", com aviso na tela.

## O que a tela traz

Filtros (período, visão, receita líquida/bruta, custos todos/próprios/reembolsáveis, custo por pagamento/competência, pessoal, 210+230) · indicador principal com comparação com o período anterior · ponte da receita ao resultado · leituras automáticas (prejuízo, concentração, margens, custo sem receita, tendência dos últimos 3 meses, contratos que terminam em 90 dias, medido sem nota) · mês a mês (receita, custos, pessoal, resultado) · margem e resultado acumulado · por área · ranking · receita × margem · mapa de resultado contrato × mês · tabela de todos os contratos (ordenável, com situação relativa à carteira) · gaveta/aba do contrato com ficha, prazo, valor do contrato × receita e tabela mês a mês · Excel.

As leituras só afirmam o que os números mostram e comparam com a própria carteira e com meses anteriores (nenhum limite de "bom" ou "ruim" inventado).

## Código

- `src/lib/resultado/calculo.ts` (conta, totais, agrupamento, selos, insights, 210+230), `receitaPorCentro.ts` (receita por centro; a soma é idêntica ao `consolidarFaturamento`), `montar.ts` (junta o custo da tela de custos).
- `src/app/api/resultado-operacional/route.ts`, `src/components/resultado/*`.
- Testes: `tests/resultado-operacional.test.ts` (conta, bruta × líquida, pessoal null, margem sem receita, soma por centro = consolidado, montagem, 210+230, insights).

## Rollback

Reverter o PR. Nada é gravado: só lê dados locais já sincronizados com o Senior.
