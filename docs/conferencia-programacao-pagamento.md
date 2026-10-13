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

## Relatório de falhas antes da remessa — regras acrescentadas em 13/10/2026

Objetivo: o que passar no relatório deve ser aceito pelo Itaú de uma vez, sem item voltando em retorno. As regras novas moram em `src/lib/pagamentos/regrasPreRemessa.ts` (funções puras, testadas em `tests/regras-pre-remessa.test.ts`) e são chamadas por `conferirItensRemessa`. Origem: ocorrências do manual SISPAG v086 (Nota 8) e os casos reais de 13/10/2026.

| Regra | Gravidade | Por quê |
|---|---|---|
| Valor do item ≠ valor do boleto **e o boleto ainda está no prazo** | **Erro** | Antes do vencimento o banco só aceita o valor exato (ocorrências IB/CF valor inválido, IE/IF mora/multa, ID desconto). Casos: boleto R$ 626,09 em título de R$ 437,55; R$ 6.098,06 × R$ 6.098,11; R$ 1.150,00 × R$ 805,00 |
| Boleto **vencido** (valor igual ou diferente do original) | Aviso | O banco recalcula juros/multa; só a 2ª via diz o valor. Vencimento em dia sem expediente vale até o próximo dia útil |
| TED (41/43) no mesmo dia **depois das 15:00** | **Erro** | Quadro de prazos do manual: "TED — mesmo dia até 15:00" |
| Data de pagamento em sábado, domingo ou feriado bancário | Aviso | O Itaú move para o próximo dia útil e devolve "data de pagamento alterada" (AE). O calendário inclui Carnaval, Sexta-feira Santa e Corpus Christi |
| **Possível lançamento duplicado**: mesmo fornecedor, mesmo valor, emissão a até 3 dias e outro número base (inclui títulos já pagos) | Aviso | Ex.: 14914$01 repetia o 47822$01 (R$ 83, mesma emissão), pago em 02/09. Parcelas ($01/$02) e recorrências mensais não são marcadas |

Já existiam e continuam: boleto único para 2 títulos, mesmo boleto em 2 itens, título duplicado de mesma parcela, linha de 48 dígitos (concessionária) com mensagem própria, cartão de crédito e PRV bloqueados, titularidade da TED, chave PIX, forma × banco.

Painel da OC: quando a OC tem título digitado mas nenhum título casou (ex.: OC 15903 citava 007990 e o título era 007900), o painel avisa e mostra o título provável (mesmo fornecedor, valor e data, em aberto e sem OC). O motor de vínculo continua sem ligar por valor/data; a correção é ajustar o número na OC (Sênior) ou usar o vínculo manual da Programação ("Corrigido" + nº da OC).

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
