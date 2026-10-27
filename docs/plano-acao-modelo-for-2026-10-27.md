# Plano de ação conforme FOR 1.0.50

27/10/2026 · Evolução do fluxo já publicado pela revisão #34.

O usuário forneceu o formulário “FOR 1.0.50 — PLANO DE AÇÃO DOS CONTRATOS — CUSTOS_CB.xlsx” como modelo de estrutura. Foram utilizados somente os campos da linha de cabeçalho A5:P5 da aba “Plano de ação - Contrato”; fornecedores, fatos e valores dos registros não são importados automaticamente.

## Estrutura do plano

O quadro de itens mantém as 16 colunas: competência; item; pacote/conta financeira; descrição; fato; medida corretiva; como executar a corretiva; medida preventiva; como executar a preventiva; responsável; início; prazo de término original; prazo reprogramado; prazo realizado; status; observações. Um resumo identifica cada ação; a descrição continua disponível separadamente. O plano pode ser preenchido antes de existir um projeto.

Os detalhes permanecem ligados ao item durante a conversão. Uma tarefa criada diretamente no projeto também pode receber o contexto do plano sem cópia da atividade. Responsável, situação e datas operacionais vêm da Task após a conversão. Reabrir um item não mantém uma conclusão antiga visível. Dados realizados exigem situação concluída e datas válidas/coerentes. Alterar fatos ou medidas invalida uma aprovação anterior.

## Criação no módulo Projetos

O botão do plano abre `/projetos?planoMeta=<id>` e preenche nome, meta, contrato, pessoas das ações e prazo. O nome começa por “Plano de ação —”. Navegar não grava projeto nem tarefa, inclusive quando a pessoa ainda não tem projetos. Somente o envio do formulário cria o projeto, incorpora as ações existentes uma vez e abre a aba Equipe. A pessoa continua montando as atividades no módulo Projetos.

A criação normal de projetos e a associação a um projeto existente são preservadas. As permissões são verificadas no servidor; não é permitido usar o vínculo para ampliar acesso financeiro. O responsável pela aprovação recebe os mesmos detalhes do formulário que compõem a versão submetida.

## Validação

Validação local final aprovada: schema e compilação, 355 testes aprovados/zero falhas/um previamente ignorado, 36 cenários/grupos HTTP aprovados e fluxo visual completo sem erros de página. Verificações remotas serão conferidas antes da publicação. O novo exemplo de Inovação não será duplicado: o projeto e as seis atividades existentes recebem apenas o contexto do modelo, permanecendo abertas e atribuídas a João Oliveira.

Editar datas no formulário reconcilia a duração explícita antes do recálculo das dependências; uma duração derivada não vira fixa. Editar somente fatos/medidas preserva os horários das datas existentes, o cronograma de outros itens e os eventos de calendário.
