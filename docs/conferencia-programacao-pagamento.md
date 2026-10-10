# Conferência da Programação de Pagamento

Atualização de 09/10/2026. Escopo: corrigir a consulta e a apresentação dos dados de pagamento dos títulos na Programação, e indicar pagamentos com cartão de crédito. A forma definida na OC não participa da apresentação nem da classificação de cartão.

## Forma e dados de pagamento

Ao abrir o descritivo da OC a partir da Programação, o modal recebe os IDs dos títulos vinculados. Consulta os dados pela mesma rota e pelas mesmas regras de preenchimento usadas em Pagamentos Itaú, com o modo `conferencia: true`. Esse modo restringe a consulta E501TCP aos números solicitados na empresa 1 e exige coincidência de filial, fornecedor, tipo e data de emissão. Correspondência ambígua não é apresentada como confirmada.

O código e a descrição exibidos vêm exclusivamente de `E501TCP.CODFPG`. Os campos adicionais `codFpgTitulo` e `formaPagamentoTitulo` identificam essa origem. Se o título não informar forma, a conferência informa isso; não substitui pela forma da OC. A auditoria de remessa de 09/10 estendeu a identificação completa e a forma exclusiva do título também à consulta do carrinho, conforme [Busca dos dados da remessa](auditoria-busca-dados-remessa.md).

CPF/CNPJ, conta, chave PIX e boleto seguem a consulta compartilhada com Pagamentos Itaú. A conta pode vir do título ou do cadastro do fornecedor; um complemento digitado na OC continua identificado como tal. O modal mostra os dados encontrados por título, a origem da conta/chave e o horário da consulta. Parcelas com formas distintas não compartilham conteúdo. Se a leitura estiver incompleta, a tela não afirma que um dado esteja ausente na Sênior.

Se a forma atual do título diferir da cópia sincronizada, o modal apresenta a forma atual e um aviso de desatualização. A lista detalhada dos títulos também usa a forma conferida. Sem confirmação atual, informa que o dado pertence à última sincronização local. O botão **Consultar novamente na Sênior** repete somente a conferência.

Exemplo fictício da homologação: `TESTE_CONF` possui forma 18 na cópia local, enquanto a Sênior simulada devolve forma 3 e conta do cadastro. A tela apresenta **3 — Depósito em Conta**, o aviso de desatualização e a conta fictícia. A forma 19 da OC simulada não é exibida como forma do título.

## Cartão de Crédito na revisão

A indicação **Cartão de Crédito** é calculada pela forma do título sincronizado e pelo catálogo da empresa 1. O código 20 corresponde a Cartão de Crédito neste tenant; variantes de crédito do catálogo também são reconhecidas pela descrição. Cartão de débito, POS, PIX, boleto e transferência não recebem essa indicação.

- O título continua visível na Programação para conferência.
- A coluna Revisão apresenta uma indicação automática, sem sobrescrever a revisão manual gravada.
- A seleção individual, os botões de seleção em lote, a seleção restaurada e o envio para o carrinho excluem esses títulos.
- A lista de candidatos de Pagamentos Itaú e os rascunhos restaurados também os excluem.
- O relatório de conferência bloqueia sua geração. A geração relê a forma dentro da transação, para impedir que uma mudança para cartão durante a conferência passe para a remessa.
- Os relatórios Excel apresentam a indicação de cartão.

A classificação depende do `CODFPG` do título sincronizado. Uma alteração feita na Sênior precisa chegar à base local para atualizar a indicação da lista e a proteção baseada nela. A consulta do modal permite conferir a forma atual, mas não grava dados nem executa operações no ERP.

## Desempenho e integridade

Abrir a Programação, o descritivo da OC ou a lista de dossiês atualiza somente o catálogo pequeno de formas de pagamento, quando necessário. Essas aberturas deixam de disparar varreduras de todos os títulos abertos e de todo o histórico, que disputavam o acesso à Sênior com a conferência. O catálogo possui controle de consulta em andamento e intervalo de 15 minutos.

O modal não consulta o cabeçalho de pagamento da OC para escolher uma forma. Os títulos são consultados em lotes sequenciais de até 100. A consulta direcionada reduz o conjunto de títulos retornado em relação à busca de todos os títulos abertos dos fornecedores.

O cliente GetDBInfo rejeita respostas HTTP de falha e `erroExecucao`, mesmo que haja conteúdo aparentemente válido. Não usa esse conteúdo como confirmação.

O sincronismo geral do n8n/VPS e o intervalo externo de atualização não foram alterados nesta entrega. Não houve mudança de esquema do banco, escrita na Sênior ou transmissão ao Itaú. A melhoria de desempenho decorre da redução de consultas e varreduras; o tempo real de produção ainda depende da rede e da disponibilidade do ERP.

## Validação

Na base local exclusiva de homologação, com dados fictícios:

- **47 testes de processamento e integração aprovados**, incluindo exclusão de cartão, forma exclusiva do título, parcelas distintas, consulta ausente e rejeição de erros do web service.
- **23 cenários HTTP aprovados** no app compilado, incluindo autenticação, consulta direcionada, identificação completa do título, forma ausente sem substituição pela OC, cartão bloqueado na geração e regressão do fluxo retorno Itaú → baixa Sênior simulada.
- Compilação Next.js e conferência de tipos aprovadas.
- Revisão visual da indicação de cartão, da seleção desabilitada e do modal com dados atuais e aviso da cópia local.

O workflow financeiro executa essas suítes em PostgreSQL isolado no GitHub Actions. As verificações locais ficam em `tmp/homologacao`, fora do Git. Para executar, seguir o preparo descrito em [Fluxo de retorno Itaú e baixa na Sênior](fluxo-retorno-itau-baixa-senior.md).
