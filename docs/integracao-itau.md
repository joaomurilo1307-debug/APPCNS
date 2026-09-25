# Integração bancária Itaú — SISPAG, DDA e Conciliação Bancária

Contexto: a Consominas Engenharia está com três implantações técnicas em andamento junto ao Itaú (confirmadas pelos e-mails de "Tracking de solicitação" recebidos em 03/09/2026):

| Produto | Protocolo | O que é |
|---|---|---|
| SISPAG | IT-000233086 | Remessa/retorno de pagamentos (CNAB240) |
| DDA | IT-000233088 | Registro eletrônico de boletos a pagar (Débito Direto Autorizado) |
| Conciliação Bancária | IT-000233091 | Extrato eletrônico para conciliar lançamentos |

Este documento descreve o processo atual, o que foi construído nesta primeira fase, e o que falta para cada produto virar uma integração completa.

## Como o processo funciona hoje (antes desta mudança)

O Consominas Gestão (este app) é um **espelho de leitura** do Senior ERP, não o sistema onde o pagamento acontece:

- Um script Python roda num VPS separado ("Rito de Gestão"), lê o Senior via `GetDBInfo` e empurra snapshots (títulos a pagar, aprovações de OC, custos) para este app via endpoints `POST /api/senior/.../sync`, autenticados por uma chave compartilhada (`SENIOR_SYNC_KEY`).
- A tela [Programação de Pagamento](../src/app/(app)/programacao-pagamento/page.tsx) só **mostra** os títulos e o vínculo com a OC — não existe nenhuma ação de pagamento nela.
- O pagamento em si (gerar o arquivo para o Itaú, ou lançar manualmente no Internet Banking) acontece **fora deste app**, hoje manualmente.
- Não havia, antes desta mudança, nenhum código relacionado a SISPAG/CNAB/DDA/conciliação neste repositório.

## O que foi construído nesta fase (Fase 1 — SISPAG, escopo Fornecedores)

Novo domínio de dados (`prisma/schema.prisma`): `ContaBancaria`, `RemessaPagamento`, `RemessaItemPagamento`, `RetornoPagamentoArquivo` (e campos de pagamento no `TituloContasAPagar`, ver "Integração com o Senior" abaixo).

Biblioteca CNAB240 do zero em `src/lib/cnab240/itau/` (sem dependência externa), implementada a partir do manual oficial `Layout-de-Arquivos_CNAB-Versa-o-086_SISPAG.pdf`:

- `remessa.ts` — gera o arquivo de remessa (.rem) para pagamentos tipo **20 — Fornecedores**, nas formas:
  - Segmento A: crédito em conta corrente Itaú (01), TED outro titular (41), TED mesmo titular (43)
  - Segmento J: boleto Itaú (30) e boleto de outros bancos (31)
- `retorno.ts` — lê o arquivo de retorno do banco e devolve, por pagamento, a ocorrência (pago/rejeitado/agendado/motivo), o "Nosso Número" atribuído pelo Itaú e a data/valor efetivos.
- `codigoBarras.ts` — decompõe código de barras (44 dígitos) ou linha digitável (47 dígitos) de um boleto nos subcampos exigidos pelo Segmento J.
- `campos.ts` / `constantes.ts` — helpers de formatação de campo fixo e as tabelas de código do manual (tipo/forma de pagamento, ocorrências de retorno).

Tela **Pagamentos Itaú (SISPAG)** (`/pagamentos-itau`, menu restrito a ADMIN/DIRETOR): permite selecionar títulos em aberto (vindos da mesma fonte da Programação de Pagamento), completar os dados de pagamento, gerar o arquivo de remessa para download, e depois importar o arquivo de retorno do banco para atualizar o status de cada pagamento.

**Fora de escopo nesta fase** (o manual cobre, mas não foi implementado): tributos (DARF/GPS/FGTS/IPVA/GARE, segmentos N/O/W), holerite (segmentos D/E/F), PIX. Ficam para uma próxima iteração se houver demanda.

### Validação (17/09/2026)

Todo o fluxo foi testado de ponta a ponta contra um Postgres local: gerar remessa (item único, e remessa com múltiplos lotes misturando boleto + crédito em conta), baixar o `.rem` gerado, simular um retorno do banco e importar de volta. Todo registro gerado bate exatamente 240 bytes, os totalizadores de lote/arquivo fecham certos, e o retorno reconcilia o pagamento pelo "Seu Número". No caminho, o teste achou e corrigiu dois bugs reais:

1. A referência gravada no banco ficava em minúsculo, mas o CNAB sempre grava em maiúsculo (exigência do próprio manual) — nenhum retorno reconciliaria nenhum pagamento em produção sem essa correção.
2. CPF/CNPJ do favorecido foi dispensado para boleto — **correção revertida em 24/09/2026**: o manual torna o Segmento **J-52** obrigatório para boletos (formas 30 e 31) e ele exige o CPF/CNPJ do beneficiário; sem ele o banco rejeita o pagamento (ocorrência "BI"). O gerador agora emite o J-52 logo após cada Segmento J (pagador = conta debitada, beneficiário = favorecido), e o documento do favorecido voltou a ser obrigatório também para boleto.

Também em 24/09/2026, antes do primeiro teste em produção com boleto real: o vencimento e o valor nominal do Segmento J passam a vir do próprio código de barras (o banco dá prioridade ao fator de vencimento do código); os dígitos verificadores da linha digitável/código de barras são conferidos (Anexo A) e uma digitação errada é recusada antes de gerar o arquivo; e a tela ganhou o campo "Nome do favorecido" (o fornecedor do Senior pode ser genérico, ex.: "FORNECEDORES DIVERSOS", e o beneficiário real do boleto é quem deve ir no arquivo).

### Integração com o Senior — feita (24/09/2026)

Os dados de pagamento são lidos **direto do Senior**, somente leitura, pelo mesmo `GetDBInfo` que o Rito usa (`src/lib/senior/getDbInfo.ts`, credenciais em `SENIOR_WS_SAPIENS_USER`/`SENIOR_WS_SAPIENS_PASSWORD` no `.env`, nunca no repositório). O sincronismo roda com:

```
npm run senior:sync -- --simular   # só consulta a Senior e mostra o resumo, não envia nada
npm run senior:sync                # envia os títulos em aberto para o app (APP_URL, padrão http://localhost:3000)
```

Ele consulta os títulos em aberto (`E501TCP`, `SITTIT='AB'`), os fornecedores (`E095FOR`) e o cadastro bancário dos fornecedores (`E095HFO`), converte (`src/lib/senior/mapeamentoTitulos.ts`) e envia em lotes para `POST /api/senior/titulos-pagar/sync?modo=incremental`. Esse modo **nunca apaga nada** e, para título que já existe, **só atualiza os campos de pagamento** — não sobrescreve o que o Rito grava (nome do CC, OC etc.). O envio sem `modo` continua sendo o sync completo do Rito (com limpeza).

**O que a base real mostrou (2.420 títulos em aberto):**

| Dado | Onde fica no Senior | Situação |
|---|---|---|
| Código de barras do boleto | `E501TCP.CODBAR` | **Vazio em 100% dos títulos** — ninguém preenche. Continua vindo do boleto (digitado/colado na tela) ou, no futuro, do DDA (Fase 2) |
| Conta do favorecido (banco/agência/conta) | `E501TCP.CODBAN/CODAGE/CCBFOR` (no título) e `E095HFO` (cadastro do fornecedor, por empresa/filial) | Título traz em ~4%; o cadastro do fornecedor completa. Agência e conta chegam como `9999-9`/`99999-9` — o sync separa o DV, como o CNAB exige |
| CPF/CNPJ do favorecido | `E501TCP.DOCIDEFAV` → `E095HFO.DOCIDEFAV` → `E095FOR.CGCCPF` | Placeholders tipo `11111111111` (fornecedor "diversos") são descartados |
| Chave PIX | `E501TCP.CHVPIX` + `TPCPIX` | ~3,5% dos títulos. Os códigos de tipo coincidem com a Nota 37 do manual: 1 telefone, 2 e-mail, 3 CPF/CNPJ, 4 aleatória. **Guardado, mas o app ainda não gera PIX** (exigiria arquivo separado, Segmento B) |

Não existe consulta ao dicionário do Oracle nesse parser (`USER_TAB_COLUMNS` etc. falham); os nomes de coluna foram descobertos com `SELECT *` (`npm run senior:descobrir`).

A tela `/pagamentos-itau` usa esses dados: título com conta completa entra como crédito (Itaú/Unibanco) ou TED (outros bancos) já preenchido, com o badge "auto"; título com código de barras entra como boleto. Tudo continua editável, e o que faltar é preenchido na tela.
## Fase 2 — DDA (Débito Direto Autorizado)

Modelo `DdaBoletoRegistrado` já existe no schema (estrutura mínima: código de barras, sacador, valor, vencimento, status). **Não implementado**: a importação em si, porque o layout exato do "arquivo de intercâmbio" do produto DDA só é confirmado quando a implantação IT-000233088 terminar com o Itaú (o manual específico ainda não estava disponível nesta pasta de referência). Quando o Itaú enviar esse manual:

1. Adaptar `src/lib/cnab240/itau/` com um parser para esse layout (mesmo padrão dos outros: posições fixas → tipo TypeScript).
2. Cruzar cada boleto DDA contra os fornecedores/títulos já conhecidos (reaproveitando a lógica de `src/lib/vinculoOcTitulo.ts` como referência de como esse tipo de cruzamento já é feito no app).
3. Boleto DDA "baixado" vira automaticamente um `RemessaItemPagamento` (Segmento J), sem precisar redigitar o código de barras.

## Fase 3 — Conciliação Bancária

Modelo `ConciliacaoBancariaLancamento` já existe (lançamento do extrato: data, valor, histórico, status de conciliação). **Não implementado**: a importação do extrato e o motor de casamento automático. Mesma situação do DDA — o formato exato (provavelmente CNAB240 retorno de extrato, ou OFX) só fecha quando a implantação IT-000233091 terminar. Quando fechar:

1. Parser do extrato (novo módulo em `src/lib/cnab240/itau/`, ou um parser OFX se for esse o formato).
2. Motor de casamento automático: para cada lançamento de débito no extrato, procurar um `RemessaItemPagamento` com mesmo valor + data + (quando disponível) "Nosso Número" — mesmo princípio do motor Título↔OC que já existe no app, só que casando *pagamento programado* com *saída real do banco* em vez de *título* com *OC*.
3. Divergências (valor bateu mas data não, ou vice-versa) ficam com status `DIVERGENTE` para revisão manual, igual ao padrão de "sem OC (investigar)" que a Programação de Pagamento já usa hoje.

## Segurança

- Nenhuma credencial do Internet Banking do Itaú é usada ou armazenada por este app — a submissão da remessa e a coleta do retorno continuam manuais (upload/download), como já orientado pelas Instruções de Procedimentos SISPAG do banco. Automatizar esse envio (via API do Itaú ou VAN) é uma decisão separada, que depende de contrato/credencial própria do banco e fica fora do escopo desta fase.
- O acesso à tela e às rotas de geração de remessa é restrito a `ADMIN`/`DIRETOR` (mais restrito que a Programação de Pagamento, que também permite `GESTOR_PROJETO`/`APROVADOR` só para leitura), por gerar um arquivo que move dinheiro de verdade.

## Passo a passo para testar com o Itaú de verdade (Ambiente de Teste)

Pré-requisito: acesso ao Internet Banking Itaú Empresas com o produto SISPAG habilitado (protocolo IT-000233086) e liberado para o **Ambiente de Teste** — nesse ambiente o manual garante que "não ocorrerá a inclusão e nem débito do pagamento", só a validação da estrutura do arquivo (seção 2.1 do manual). É seguro testar à vontade.

1. **Subir o app** (nesta máquina já está tudo pronto — Postgres 16 rodando como serviço, `.env` configurado, dependências instaladas):
   ```bash
   cd C:\Users\gabriel.furst\Documents\APPCNS
   npm run dev
   ```
   Abrir `http://localhost:3000`, login `admin@consominas.com.br` / `TrocarSenha123!` (ou o usuário/senha real, se já tiver trocado).

1b. **Trazer os títulos reais do Senior** (precisa do app rodando e de `SENIOR_WS_SAPIENS_USER`/`SENIOR_WS_SAPIENS_PASSWORD` no `.env`; leva ~5 min, é somente leitura no Senior e não apaga nada no app):
   ```bash
   npm run senior:sync
   ```
   Rode de novo sempre que quiser atualizar (por exemplo, no começo do dia).

2. **Cadastrar a conta bancária real** da empresa em `/pagamentos-itau` → "+ cadastrar conta": CNPJ, agência, conta e DAC reais da Consominas no Itaú (os mesmos usados no cadastro do SISPAG).

3. **Escolher um título real, de valor baixo**, pra primeiro teste — mesmo sem débito real, evita confusão se algo aparecer errado. Clicar "adicionar".

4. **Conferir/preencher os dados do pagamento**: se o fornecedor já tiver "auto" (dado veio do sincronismo), só revisar; senão, preencher CPF/CNPJ do favorecido e banco/agência/conta/DAC (crédito ou TED) ou o código de barras do boleto.

5. **Gerar a remessa** e baixar o arquivo `.rem`.

6. **No Internet Banking Itaú Empresas**, subir o arquivo em Ambiente de Teste: `Mais.. → Transmissão de Arquivo → Transmissão (Teste) → Remessa → Enviar → Produto PAGAMENTOS SISPAG`, selecionando o `.rem` baixado no passo 5. **Confirme que está em "Teste", não "Produção"**, antes de enviar.

7. **Consultar o processamento**: `Mais.. → Transmissão de Arquivo → Transmissão (Teste) → Consultar resultado do processamento do arquivo`. Se vier "NÃO PROCESSADO", o arquivo inteiro foi rejeitado (erro estrutural — me mande a mensagem, é bug no gerador). Se vier processado com "REJEIÇÃO" em algum registro, só aquele pagamento específico tem problema (ex: agência/conta inválida) — os demais continuam válidos.

8. **Baixar o arquivo de retorno**: `Mais.. → Transmissão de Arquivo → Transmissão (Teste) → Retorno → Recepcionar`.

9. **Importar o retorno** de volta na tela `/pagamentos-itau`, botão "Importar arquivo de retorno", selecionando o `.ret` baixado do banco. Confira que os pagamentos mudaram de status (mesmo que "Rejeitado" — o objetivo deste primeiro teste é validar que o Itaú aceita a *estrutura* do arquivo, não necessariamente que o pagamento específico esteja 100% correto).

10. Se algo vier rejeitado por causa não óbvia, o código da ocorrência (ex: "AL", "AM", "IN"...) está descrito na Nota 8 do manual `Layout-de-Arquivos_CNAB-Versa-o-086_SISPAG.pdf` — a tela já traduz os códigos mais comuns automaticamente.
