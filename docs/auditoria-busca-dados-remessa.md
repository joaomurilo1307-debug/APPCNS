# Busca e conferência dos dados da remessa Itaú

Atualização de 10/10/2026. A auditoria utilizou dois arquivos reais fornecidos pelo financeiro, com correções manuais, e consultas de leitura à Sênior. Os arquivos, documentos, contas e respostas reais ficam somente em `tmp/homologacao`, fora do Git. As regressões versionadas utilizam dados fictícios.

## Evidências e limites

Os arquivos têm 27 e 37 registros, respectivamente, todos com 240 posições. O segundo contém 13 boletos. Os dígitos verificadores desses códigos de barras são válidos. Nos cinco boletos indicados como rejeitados por divergência CIP, a conversão da linha digitável atual do título na Sênior resulta no mesmo código enviado no arquivo. Não foi constatada troca de código de barras nesses cinco casos. Isso não comprova a origem de cada alteração manual nem a aceitação bancária dos demais pagamentos.

Nos títulos correspondentes aos cinco boletos, os campos de documento do favorecido estão vazios. O J-52 do arquivo usa o CNPJ do fornecedor. O documento do fornecedor pode diferir do beneficiário registrado no boleto, especialmente com intermediários. O DV do CNPJ não comprova correspondência no cadastro CIP. Os arquivos não informam qual documento a CIP esperava; não é possível deduzi-lo apenas do código de barras.

Dois títulos informados pelo financeiro têm banco, agência e conta no próprio título, com conta sem hífen e sem DV separado. A implementação anterior exigia conta completa para retornar qualquer dado e descartava também os campos preenchidos. A conta completa não deve ser obtida removendo arbitrariamente seu último algarismo. A [documentação da Sênior para integração bancária](https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/integracoes/van-bancaria/van-bancaria-integracao.htm) orienta o cadastro com separação do dígito.

## Correções

- Toda busca de remessa usa empresa 1 e os números solicitados. A correspondência exige filial, fornecedor, número, tipo e emissão. Mais de um registro ou ausência de identificação não fornece destino por fallback.
- Títulos abertos em situação especial, incluindo PE, podem fornecer dados. Títulos cancelados, liquidados ou sem saldo não fornecem destino. A geração continua informando os cuidados específicos de situação PE.
- Cadastro bancário E095HFO é consultado nas filiais solicitadas. Não há escolha da primeira conta de outra filial, nem mistura de campos de fontes diferentes. Cadastro ambíguo não é escolhido.
- Banco, agência e conta parcial do título são preservados. A tela indica o DV ausente. O financeiro deve confirmar o DV/cadastro; ele não é inventado.
- Os campos `CODFAV` e `DOCIDEFAV` do título são lidos para o documento do favorecido, antes do cadastro ou fornecedor. `CODFAV` é o campo numérico legado, conforme [F077FAV](https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/menu_cadastros/f077fav.htm). Seu preenchimento não depende do tipo de pessoa do fornecedor, que pode ser diferente. Um documento explicitamente inválido no título não é substituído pelo CPF/CNPJ do fornecedor.
- Código de barras de 44 posições e linha digitável de 47 são validados e normalizados. Código inválido, inclusive 48 dígitos, gera aviso específico, em vez de ausência silenciosa. Contas de consumo de 48 dígitos continuam fora do segmento J.
- PIX aceita tipos `1` e `01`, etc. A forma vem somente do título. Um título classificado como boleto não é convertido em transferência porque o cadastro tem conta bancária; uma chave PIX residual não transforma depósito em PIX.
- Complementos de OC exigem correspondência de empresa, filial e fornecedor. A forma da OC não substitui a forma do título.
- Atualização ao vivo substitui o bloco automático intacto e o documento automático. Edições manuais permanecem visíveis e não são sobrescritas. Identidade dos itens do carrinho usa ID do título, distinguindo tipos e emissões de números iguais.
- Leituras GetDBInfo compartilham fila por processo, para evitar consultas sobrepostas de telas simultâneas. Falhas não são interpretadas como dados ausentes.
- A geração faz uma releitura atual da Sênior. Leitura incompleta, identidade ambígua, título não disponível, cartão de crédito atual e divergência de boleto/favorecido/conta explicitamente preenchidos no título bloqueiam a criação. Ajustes manuais de dados ausentes continuam possíveis.
- A forma atual de boleto/PIX do título é conferida novamente antes de gravar: um carrinho antigo não pode gerar TED para um título definido como boleto.

## Pagamentos já gerados e limpeza da lista

O histórico é obrigatório no carregamento da tela. Falha na consulta não é convertida em lista vazia de pagamentos já gerados. A geração confirmada remove os itens do carrinho, atualiza imediatamente a lista de IDs reservados e grava o rascunho sem esses itens. Respostas de leitura atrasadas atualizam apenas os itens que ainda estão no carrinho.

O botão **Limpar todas as remessas** arquiva as remessas visíveis e grava usuário e IDs em auditoria. **Mostrar arquivadas** permite consultar arquivos, importar retornos e dar baixa; **Restaurar remessas** desfaz a limpeza. O campo opcional `RemessaPagamento.arquivadaEm` requer atualização do schema, aplicada primeiro na base isolada. A limpeza não altera status, valores, itens, reservas de títulos nem vínculos com retornos. Remessas arquivadas continuam no histórico e impedem gerar novamente um pagamento pendente/agendado/pago. Rejeitados continuam seguindo as regras existentes de nova tentativa.

## Beneficiário do boleto

O carrinho mostra a origem do documento, destacando quando é o fornecedor. Cada boleto exige a confirmação do CPF/CNPJ com o beneficiário do boleto registrado ou da consulta bancária. A confirmação fica vinculada ao par documento + código de barras: mudar qualquer um invalida-a, inclusive no rascunho. O servidor aplica a mesma validação, e documento com DV inválido bloqueia a geração.

O usuário, o título e o par documento/código utilizado são registrados no AuditLog, dentro da transação de geração. A simulação desfaz também a auditoria. Essa confirmação registra a conferência humana; não equivale a uma consulta automatizada da CIP. Conforme o [Itaú](https://www.itau.com.br/atendimento-itau/para-empresas/pagamentos/o-que-muda-para-quem-realiza-pagamento-via-transmissao-de-arquivos), dados incorretos do beneficiário no J-52 provocam rejeição.

Não há integração de consulta de beneficiário CIP/DDA disponível neste repositório. Automatizar essa confirmação depende de um serviço bancário contratado e acessível. Sem ele ou sem documento correto no título, o sistema não deve afirmar que o CNPJ do fornecedor está validado no banco.

## Homologação

`npm run test:financeiro` inclui regressões de identidade completa, conta parcial, filial incorreta, situação PE, documento legado, boleto inválido, preservação de edição manual, confirmação por documento/boleto e fila de leituras. `npm run test:financeiro:http` testa as rotas compiladas, autenticação, bloqueios antes da gravação, auditoria e o fluxo de retorno/baixa na Sênior simulada.

Resultado local: 65 testes de regras/leitura e 31 cenários HTTP aprovados (96 no total), com Postgres isolado, NextAuth e SOAP simulado. Os cenários HTTP adicionais verificam a forma de boleto atual, arquivamento autenticado, bloqueio de duplicidade após limpar, retorno de remessa arquivada, restauração e auditoria.

A leitura real inicial permitiu constatar os campos dos casos investigados. As tentativas finais de revalidação completa encontraram timeout no web service da Sênior; não comprovam ausência de cadastro. A busca agora encerra quando a consulta do título falha, sem encadear consultas auxiliares inúteis. A homologação usa Sênior simulada e não substitui o aceite do banco nem a revalidação quando o endpoint real estiver disponível.

Não houve envio dos arquivos reais ao banco, nova remessa com os títulos reais ou baixa de produção nesta auditoria. A validação bancária final exige o beneficiário correto e o resultado de processamento do Itaú. Os detalhes particulares do diagnóstico ficam no relatório local `tmp/homologacao`.
