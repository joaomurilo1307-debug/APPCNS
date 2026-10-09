# Retorno Itaú → baixa na Sênior — implementação de 09/10/2026

## Fluxo disponível no sistema

A tela **Pagamentos Itaú** importa o CNAB240 de retorno, valida o arquivo inteiro, relaciona os pagamentos com suas tentativas de remessa e permite concluir a baixa na Sênior por `GerarBaixaPorLoteCP`. O sistema envia dados estruturados dos títulos ao SOAP; não envia o arquivo CNAB para essa operação.

1. Clique em **Importar arquivo de retorno** e selecione o arquivo disponibilizado pelo Itaú. A extensão não determina se o conteúdo é um retorno válido.
2. Confira o resultado nos **Últimos retornos importados**: pagos, agendados, rejeitados, cancelados e referências sem correspondência. O resumo fica gravado e pode ser consultado após recarregar a tela. Um retorno pode estar associado a várias remessas.
3. Na remessa desejada, clique em **Conferir na Sênior**. Se a conta interna já estiver cadastrada, a prévia de leitura inicia ao abrir o painel; caso contrário, informe o `numCco` correspondente e confira a prévia.
4. Verifique os títulos elegíveis, os já liquidados e os bloqueados. Só pagamentos confirmados pelo banco, ainda abertos na Sênior e com valor efetivado igual ao saldo podem ser enviados automaticamente.
5. Clique em **Confirmar baixa na Sênior**. O sistema reserva os itens, envia lotes de até 50 títulos agrupados por filial e data e trata a resposta de cada título pelo `numInt`.
6. Após o SOAP, o sistema lê novamente o título. Com saldo zero e situação admitida, registra a baixa conferida e atualiza imediatamente o espelho da **Programação de Pagamento**, na mesma transação. A data vem de `E501TCP.ULTPGT`; se ausente ou inválida, não inventa uma data e mantém a informação local existente.
7. Se a resposta se perder, o item fica **baixa a conferir**, sem reenvio automático. Ao abrir novamente a prévia, um título efetivamente liquidado aparece entre os já baixados. **Concluir conferência dos já liquidados** registra essa confirmação e atualiza o espelho sem enviar outro SOAP.

Agendamento, devolução, estorno e divergência de valor não são tratados como baixa concluída. Ocorrências desconhecidas ou contraditórias exigem conferência. A confirmação permanece uma ação explícita do financeiro; importar o arquivo sozinho não executa escrita no ERP.

## Garantias e limites técnicos

| Etapa | Proteção implementada |
|---|---|
| CNAB | Banco 341, header de retorno, 240 bytes ASCII, datas/números válidos, lotes fechados e contagens consistentes. |
| Identificação | Referência única por tentativa nas novas remessas; comparação de conta, forma e dados do pagamento; legado ambíguo bloqueado. |
| Importação | Transação, trava PostgreSQL e hash normalizado. Reimportar mantém o resumo e mostra as pendências atuais sem duplicar histórico. |
| Auditoria | Arquivo preservado, resumo persistente, referências não reconhecidas e remessas vinculadas. O GET retorna os últimos 50 arquivos sem divulgar o conteúdo bruto. |
| Baixa | Prévia ao vivo, conferência da conta, reserva exclusiva por item/título, agrupamento por filial/data e análise dos erros individuais. |
| Resultado | HTTP com falha é inconclusivo, mesmo com XML `ERRO`; SOAP `OK` sem saldo zero posterior também fica inconclusivo. |
| Espelho financeiro | Item e título são atualizados atomicamente após leitura efetiva da liquidação na Sênior; o retorno bancário sozinho não marca o título pago. |
| Homologação | Banco, credenciais fictícias, portas e cache separados. A suíte HTTP verifica também a configuração do servidor alvo antes de escrever. |
| Publicação | `.dockerignore` exclui ambientes locais, cache de homologação, arquivos temporários e uploads de teste. |

O sistema protege contra duas confirmações simultâneas pelo próprio app. Não existe transação distribuída entre PostgreSQL e Sênior: falhas de rede ou interrupção podem deixar o resultado inconclusivo, que será conferido sem repetição automática. Título ainda aberto após um envio inconclusivo exige investigação no ERP, inclusive Tesouraria, antes de liberar qualquer nova tentativa.

A liquidação automática é integral, sem juros, descontos, multas ou diferença entre valor pago e saldo. A consulta automática posterior confirma a situação e o saldo do título; a homologação real também precisa conferir movimentos de contas a pagar e Tesouraria. A importação nativa na F510PRT é um caminho distinto e não deve ser usada para baixar novamente os mesmos pagamentos.

O espelho local é atualizado imediatamente para os itens conferidos nesta operação. A sincronização externa normal continua sendo a fonte das demais alterações do ERP, incluindo reaberturas e estornos legítimos; um snapshot antigo pode temporariamente trazer uma situação anterior até a próxima sincronização atualizada.

## Configuração e esquema

- `SENIOR_WS_SAPIENS_USER` e `SENIOR_WS_SAPIENS_PASSWORD`: usuário de integração com permissão de consulta e baixa. Guardar no ambiente do servidor, nunca no Git.
- `SENIOR_WS_SAPIENS_URL`: endpoint de leitura `GetDBInfo`, se precisar substituir o padrão existente.
- `SENIOR_WS_BAIXA_URL`: endpoint de títulos a pagar com a operação `GerarBaixaPorLoteCP`, se precisar substituir o padrão existente.
- Cada conta bancária deve ter `numCcoSenior` validado contra `E600CCO`. Empresa padrão 1 e transações `90550`/`90650` são os valores atuais; confirmar sua parametrização no ERP antes da homologação real.
- Novos campos opcionais em `RetornoPagamentoArquivo`: `hashArquivo` com índice único e `resultadoImportacao` JSON. Registros anteriores permanecem válidos, com indicação de resumo histórico indisponível quando necessário.

O projeto aplica o esquema Prisma no entrypoint do contêiner. Nesta entrega o esquema foi aplicado somente à base local de homologação. Não foi executada migração nem baixa no ERP de produção. O fluxo usa a operação documentada em [Títulos de contas a pagar — web services Sênior](https://documentacao.senior.com.br/goup/5.10.3/webservices/com_senior_g5_co_mfi_cpa_titulos.htm).

## Validação e repetição

Execute na raiz do projeto:

```powershell
npm run homologacao:preparar
npm run test:financeiro
npm run homologacao:build
npm run homologacao:start
```

Com o app ativo na porta 3001 e a porta 3099 livre, execute em outro terminal:

```powershell
npm run test:financeiro:http
```

A suíte HTTP inicia e encerra seu próprio servidor SOAP falso. Não deixe o simulador manual ocupando a porta 3099 durante ela. Para revisão manual após a suíte, execute `npm run homologacao:senior`. O usuário e a senha da homologação estão no arquivo local `.env.homologacao`.

Os testes cobrem importação estrutural, ocorrências, referências ambíguas, rollback, reimportação, remessas múltiplas, agendamento sem prova, baixa concorrente, erros individuais, lote parcialmente aceito, resposta perdida após gravação, HTTP inconclusivo e atualização imediata do espelho após liquidação. A evidência local HTTP fica em `tmp/homologacao/resultado-http.json`.

Validação local executada em 09/10/2026: **38 testes de processamento/integração e 17 cenários HTTP aprovados (55 verificações)**, além da compilação completa do Next.js com conferência de tipos. Os cenários HTTP foram executados contra a versão compilada do app.

O workflow `.github/workflows/financeiro-itau.yml` reproduz preparo, testes, compilação e cenários HTTP em PostgreSQL isolado no GitHub Actions, usando somente dados e credenciais fictícios. O workflow existente de publicação da imagem continua vinculado à branch `master`; enviar a branch de trabalho não publica a imagem `latest`.

## Homologação real ainda necessária

Ainda faltam arquivos reais pareados de remessa/retorno e conferência supervisionada na Sênior de produção. Os testes locais e o contrato WSDL/XSD conferido não comprovam a configuração do convênio Itaú, permissões do usuário ou efeito contábil das transações. Ao receber os arquivos, reproduzir a importação na base de testes, conferir a prévia real e validar um pagamento já confirmado, verificando título, saldo, movimentos, conta, valor, data e sincronização externa.

Consulte também a [auditoria inicial de 08/10/2026](auditoria-financeiro-itau-2026-10-08.md), que registra a análise do manual SISPAG e as falhas do fluxo anterior.
