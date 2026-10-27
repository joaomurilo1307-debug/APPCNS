# Metas, planos de ação e projetos

## Escopo confirmado em 27/10/2026

Melhorar a lógica das abas Metas e Planos de Ação que já existem dentro de Contratos. Não criar uma nova entrada ou aba global para esse fluxo. O usuário autorizou um exemplo identificado no administrador, no CCU 19 de Inovação, com redução de custo de 10% em um ano e atividades atribuídas a João Oliveira. Os testes de desenvolvimento continuam isolados, sem alterar o Senior.

## Fluxo esperado

1. A pessoa define a melhoria e o indicador que comprovará seu resultado.
2. Escolhe fonte própria/manual ou um dado existente: custo, conta de custo, centro de custo, faturamento ou medição. Contrato/CCU é contexto opcional da meta, obrigatório apenas quando a fonte financeira precisar dele.
3. Define a referência, o alvo absoluto ou percentual, a direção (aumentar, reduzir, atingir ou manter) e a periodicidade de análise.
4. Acompanha realizado, alvo e desvio em cada período, com data da fonte e indicação de período aberto, futuro ou sem informação.
5. Cria ou associa o plano de ação à meta, com atividades, pessoas e prazos. O plano existe sem exigir um projeto.
6. Se quiser, usa o botão do plano para criar um projeto ou associar um existente. As mesmas atividades são incorporadas uma única vez e passam a ser compartilhadas com Projetos.
7. Ao concluir as atividades, envia o plano ao responsável designado para aprovação. Execução e aprovação atualizam o acompanhamento da meta, preservando seu resultado medido.
8. Pode associar a meta a uma meta geral do setor, definindo o peso percentual da contribuição. Um peso de 80% continua sendo 80% da composição, sem renormalizar para 100% quando faltam outras contribuições.

## Regras de integridade

- Plano novo sempre parte de uma meta. O tipo antigo de plano sem indicador continua legível; não será usado como substituto para novas metas.
- Criar o plano não cria um projeto; a conversão é uma escolha explícita da pessoa.
- Resultado e execução são independentes: concluir atividades não comprova atingir o indicador.
- Envio para aprovação exige pelo menos uma atividade e execução de 100%. Somente o responsável designado pode aprovar ou rejeitar; não há autoaprovação. Alterar o conteúdo do plano, projeto ou atividades invalida a aprovação anterior e exige nova avaliação.
- Associar projeto não duplica medições ou atividades, nem amplia acesso aos dados financeiros.
- Criar o plano repetidamente não cria projetos repetidos.
- Uma meta pode receber contribuição de outros projetos por vínculo explícito. O projeto principal do plano identifica sua execução.
- Referência inicial e período de acompanhamento são campos distintos. Percentual relativo não é ponto percentual.
- Valor zero confirmado é diferente de fonte indisponível, período sem cobertura da sincronização ou competência sem medição manual. Uma janela sem cobertura não pode comprovar redução de custo.
- A composição do setor usa o peso informado, sem renormalizar o restante: contribuição de peso 80% com resultado de 50% representa 40% da meta geral. Contribuições sem resultado ficam pendentes, sem virarem zero.
- Consulta e prévia não cadastram metas, projetos ou medições e não disparam sincronização do Senior.
- Dados anteriores permanecem legíveis. Toda mudança de schema deve ser revisada e validada em banco isolado antes de publicação.

## Critérios de aceite

- Meta própria sem contrato, com fonte manual e periodicidade configurável.
- Aumento e redução percentual calculados sobre a referência, incluindo validação de zero e valores negativos.
- Meta automática de custo total ou conta de um CCU autorizado, com referência separada do acompanhamento.
- Avaliações mensais, trimestrais, semestrais e anuais sem somar períodos incompatíveis.
- Evolução mensal automática financeira ou registros manuais por competência, com melhoria visível e avaliação ao fim do horizonte.
- Criar plano sem projeto; converter ou associar projeto existente somente quando solicitado.
- Envio e decisão de aprovação pelo responsável designado, sem aprovação automática por tarefas concluídas.
- Composição da meta geral do setor por pesos, sem dupla contagem e respeitando os acessos.
- Alterar atividade em Projetos e refletir na meta, e vice-versa, sem sincronização de duas listas.
- Meta, plano e projeto acessíveis nos dois sentidos conforme as permissões.
- Acesso negado à fonte não revela valores por um vínculo a projeto.
- Nenhuma alteração em cadastros reais durante desenvolvimento ou testes.

## Situação

Implementação local inclui o plano independente, a conversão opcional em projeto, as abas existentes de Contratos, aprovação designada e pesos da meta do setor. A rodada final de compilação, regressão, HTTP e navegador está em andamento. A revisão remota no repositório APPCNS foi expressamente autorizada pelo usuário; nenhuma publicação ou criação do exemplo real foi realizada até o registro desta revisão. Evidências e limites em [validação da entrega](validacao-metas-planos-projetos-2026-10-26.md).
