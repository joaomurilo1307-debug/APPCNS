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

## Baixa do título na Senior depois do pagamento (GerarBaixaPorLoteCP)

O retorno do Itaú fecha o ciclo **aqui**, mas a Senior continua com o título "Não pago" até alguém lançar a baixa lá — e a tela de
retorno da Senior (F510PRT) **não serve** pra isso: ela importa CNAB240 pelo vínculo com o `NUMPGE` gerado pelo módulo de Pagamento
Eletrônico da própria Senior, e o nosso arquivo não nasceu lá. O caminho certo é o web service `GerarBaixaPorLoteCP`
(`com.senior.g5.co.mfi.cpa.titulos`, situação "atual", substituto oficial do descontinuado `BaixarTitulosCP`), que baixa **direto pelo
número do título**. Implementado em `src/lib/senior/baixaTitulos.ts` e `POST /api/pagamentos-itau/remessas/[id]/baixa-senior`
(botão "Baixar N pago(s) na Sênior" em `/pagamentos-itau`, só ADMIN/DIRETOR).

**Valores deste tenant, confirmados em dado real da Senior (01/10/2026):**

| Campo | Valor | Origem |
|---|---|---|
| `tnsBai` | `90550` | Faixa 90550-90579 = "Pagamento de Título" (F001TPA); é a mais usada nas baixas (17 mil movimentos) |
| `tnsCxb` | `90650` | "Débito Pagamento Contas a Pagar (CP)" (E001TNS). As baixas pela conta interna `341` usam 90650. **Não** usar 90665 ("Débito Cheque - CP") nem 90656 (transferência entre contas) |
| `numCco` | `341` p/ ag 5605 cc 99624-7 | Conta interna "Banco Itaú" (E600CCO, F600CCO). É obrigatório e **não dá pra derivar** da agência/conta (a Senior guarda NUMCTA com e sem DAC conforme o cadastro) — fica em `ContaBancaria.numCcoSenior`, informado no painel de baixa na primeira vez |
| `codEmp` | `1` | Todos os 20.174 títulos são da empresa 1 |
| `codTpt`, `codFor`, `codFil`, `numTit` | do próprio título | `TituloContasAPagar.tipo/codFor/codFil/numTit` |

A conta 84193-0 ("CONSOMINAS GAR") **não tem nenhuma baixa de fornecedor** na Senior — não configurar `numCcoSenior` nela sem confirmar
com o financeiro qual conta interna eles usam ao baixar pagamentos feitos por ela.

**Formato (manual, "Campos numéricos"):** campos declarados `String` (ex.: `vlrBai`) vão com **vírgula decimal e sempre 2 casas**
(`1658,55`), sem milhar; campos `Double` iriam com ponto. Datas `dd/MM/aaaa`.

**Salvaguardas (é escrita no razão financeiro):**
- Sem `confirmar: true` só **simula** (lê a Senior, não grava) — o painel mostra a prévia antes do botão de confirmar.
- Cada título é conferido **ao vivo** na Senior (`E501TCP`: `SITTIT`/`VLRABE`) antes de enviar: já liquidado → `JA_BAIXADO` (nunca baixa
  duas vezes); `CA`/`PE`/`AV`/`LS`/`LV` → bloqueado; valor pago ≠ valor em aberto → bloqueado (desconto/juros/parcial é decisão
  contábil, baixa manual).
- Só entra item com status `PAGO` (ocorrência "00" do retorno) e título vinculado.
- Resposta da Senior diferente de `resultado = "OK"` (ou com `erroExecucao`) **nunca** vira sucesso: o item fica `ERRO` com a mensagem,
  e a nova tentativa passa pela conferência ao vivo (se a Senior tiver gravado apesar da falha de rede, aparece `JA_BAIXADO`).
- Estado por item em `RemessaItemPagamento.baixaSeniorStatus/Em/Msg/PorId`.

**Vínculos entre os dois sistemas (02/10/2026):**
- **Contrato conferido no servidor real:** o WSDL/XSD do tenant (`...cpa_titulos?wsdl` / `?xsd`) confirma a operação `GerarBaixaPorLoteCP` com
  todos os campos que enviamos e tipos certos; o envelope sai **na ordem do XSD** (`xs:sequence`, alfabética), não na do exemplo do manual.
  Existe também `GerarBaixaPorLoteCP2` (só acrescenta campos de moeda estrangeira) — não usada.
- **Conta interna conferida na Senior antes de qualquer baixa:** o `numCco` informado precisa existir em `E600CCO`, estar ativo (`SITCCO = A`)
  e bater banco/agência/conta com a conta bancária da remessa — senão a baixa nem é simulada (erro 422 com a explicação). Impede baixar na
  conta errada (ex.: "CONSOMINAS GAR" no lugar de "341").
- **Retorno -> Programação de Pagamento:** ao importar o retorno, o título cujo pagamento o banco confirmou (`00`) ou agendou (`BD`) passa
  sozinho a "Enviado (aguarda baixa Senior)" — só se estava sem revisão ou "Aprovado" (nunca sobrescreve "Corrigido", que guarda o vínculo manual
  de OC). Efeito colateral bom: título já enviado sai do atalho "Selecionar aprovados" e não é selecionado de novo por engano.
- **Baixa lançada (ou já existente) -> limpa essa marca;** "Pago" aparece na Programação de Pagamento na próxima sincronização com a Senior
  (VLRABE = 0, até ~10 min) — o app nunca força o "pago".
- **Retorno em duas etapas:** o 1º retorno costuma vir "agendado" (`BD`); só o retorno do dia do pagamento (`00`) deixa o item pronto para baixa.
  A tela de importação avisa quantos estão prontos e quantos ainda agendados.

**Ainda não validado em produção** (precisa de um primeiro teste real, supervisionado, com **um** título): permissão de escrita do
usuário da Senior usado pelo app nesse web service; se a Senior exige `seqChe`/`codFpg`/`numDoc` mesmo sendo opcionais no manual; e
o que aparece em Tesouraria. O usuário da integração fica registrado como autor da baixa (`USUGER`) — vale usar uma conta de serviço.

## Forma de pagamento da Senior dentro da OC (05/10/2026)

Ao clicar na OC (Programação de Pagamento, Conferência de OC, Aprovações Senior e Plano de Contas — todas usam o mesmo modal `MapaOC`), o
descritivo mostra a **forma de pagamento**: **código** (`E501TCP.CODFPG`, do próprio título) e **descrição por extenso** (catálogo da tela F066FPG,
tabela `E066FPG`). Aparece em dois lugares do modal: um resumo no topo ("Forma de pagamento (do título real)") e uma linha em cada título gerado
pela OC. Títulos de formas diferentes listam todas; sem forma informada mostra "não informada na Senior". Não há coluna nas tabelas das abas.

- **É do título, não da OC:** segue a mesma regra do "Pagamento (do título real, não da OC)" que já existia no modal.
- **A Conferência de OC passou a repassar ao modal a lista de títulos gerados pela OC** (a API já devolvia; essa tela não a repassava) — por isso agora
  ela também mostra o bloco "Título(s) gerado(s) por esta OC", como as outras telas.
- **Catálogo por empresa:** `E066FPG` tem uma linha por `CODEMP` (as empresas-modelo 9997/9998/9999 e 1 a 8). Vale a descrição da empresa 1;
  as outras só preenchem códigos que a empresa 1 não tenha. Empresa 1: 1 = Cobrança Bancária, 3 = Depósito em Conta, 4 = Ordem de Pagto,
  17 = Fatura, **18 = Boleto, 19 = PIX**, 20 = Cartão de Crédito, 21 = Remessa.
- **`CODFPG = 0` na Senior significa "não informado"** (803 dos 1.394 títulos abertos em 05/10/2026) — é o dado real, não falha.
- **Esquisitice do GetDBInfo:** em `E066FPG`, `SELECT *` responde (5 a 26 s), mas `SELECT CODFPG, DESFPG ...` com colunas explícitas **não responde**
  (timeout). `E028FPG` (condição de pagamento) não serve — erro "Empty string". Por isso o catálogo é lido com `SELECT *`.
- **Quem busca:** o sincronismo automático de títulos roda no VPS (script Python via n8n, fora deste repositório) e **não envia** o `CODFPG`.
  Então o próprio app lê da Senior (somente leitura, mesmas credenciais do GetDBInfo) em segundo plano — `src/lib/senior/formasPagamento.ts`,
  disparado ao abrir a Programação de Pagamento, a Conferência de OC ou o modal da OC: catálogo + `CODFPG` dos títulos **abertos** a cada 15 min, e uma
  varredura de **todos** os títulos (histórico) a cada 12 h. Nenhuma tela espera por isso; logo após subir o app, o primeiro modal aberto pode ainda
  mostrar "não informada" até a primeira busca terminar (segundos). Se o script do VPS passar a enviar `codFpg`, a rota de sync grava igual
  (campo ausente = não mexe) — os dois caminhos convivem.

### Tipo de pagamento definido na própria OC (06/10/2026)

A forma acima vem do **título**; OC que ainda não gerou título não mostrava nada. O modal agora também tem **"Tipo de pagamento (definido na OC)"**:
`E420OCP.CODFPG` + descrição do mesmo catálogo, lido **ao vivo** da Senior (`src/lib/senior/pagamentoDaOc.ts`, cache de 10 min em memória) por uma rota
própria — `GET /api/senior/aprovacoes/[numOcp]/pagamento` — pra o modal abrir na hora e esse campo entrar quando a Senior responder (~2 s). Quando o
comprador digitou dados de pagamento na OC (`USU_CHVPIX`, `USU_CODAGE`, `USU_NUMCCO`, `USU_DESCCO`) eles aparecem logo abaixo. Consulta com colunas
explícitas em `E420OCP` responde normalmente (a esquisitice de timeout é só do `E066FPG`).

## Conferência antes de gerar a remessa (06/10/2026)

**Correção automática de chave PIX (06/10/2026, caso 007940):** chave cadastrada como *telefone* cujos dígitos (com ou sem o `55`) são exatamente o CPF/CNPJ do
favorecido (na Senior estava `+5515131589614` = `+55` + CPF) é **corrigida sozinha para tipo 03 (CPF/CNPJ)** na conferência, na tela e na montagem do arquivo
(`lib/cnab240/itau/chavePix.ts`), com aviso pedindo pra corrigir também na Senior. Telefone que não é celular válido (DDD + 9 dígitos começando com 9) vira erro
quando a chave é o único destino e aviso quando há conta bancária completa. Dúvida em aberto pro teste no Itaú: com conta completa (tipo de transferência `01`)
mandamos também o Segmento B com a chave — o manual só o exige no modelo "Chave" (`04`); o retorno do Teste dirá se o Itaú valida esse B.

Problema: a geração falhava com "Dados inválidos" ou com a exceção crua do CNAB, sem dizer **qual título** nem **qual campo**; ficava-se tentando gerar até
dar certo. Agora há um **relatório de conferência** que roda antes e diz, por título, o que falta ou está errado:

- **Regras por item** (`src/lib/cnab240/itau/validacaoItem.ts`, funções puras): CPF/CNPJ obrigatório (Nota 15 do manual — BACEN, TED/PIX), com aviso se o
  dígito verificador não bate; conta de Itaú/Unibanco (341/409) aceita agência até 4 e conta até 6 dígitos, outros bancos 5 e 12, DAC com 1 caractere;
  PIX vale **chave (com tipo) OU conta completa**; boleto precisa de linha digitável de 47 (ou código de barras de 44) dígitos com DV conferido — **48
  dígitos é conta de consumo/concessionária, que este layout não cobre** (a mensagem manda pagar por outro meio); data inválida/passada vira aviso.
- **Checagens que dependem do banco** (`src/lib/pagamentos/conferenciaRemessa.ts`): título já pago, em situação especial (≠ AB), repetido no carrinho
  (erros) e já presente em remessa gerada ainda válida — pendente/agendado/pago (aviso: pagaria em dobro).
- **Ensaio do arquivo CNAB** em memória (sem gravar), pra qualquer falha que só apareceria na hora de montar o arquivo apontar o título culpado.
- `POST /api/pagamentos-itau/remessas/conferir` devolve o relatório; a tela de Pagamentos Itaú o pede sozinha (450 ms após cada mudança no carrinho),
  pinta de vermelho o campo errado de cada item e trava o botão "Gerar remessa" enquanto houver erro.
- **Geração única:** `POST /remessas` roda a **mesma** conferência em todos os itens antes de gravar qualquer coisa. Com erro, não gera nada e devolve o
  relatório completo (HTTP 422). Sem erro, grava numa transação só. `somenteValidos: true` (botão "Gerar só com os N sem problema") gera apenas com
  quem passou e devolve os `ignorados`. O PIX **sai em arquivo separado** dos demais (exigência do Itaú — "Instruções de Procedimentos": remessa com
  PIX, transferência ou QR Code, deve ir apartada), então um carrinho misto produz **2 arquivos numa geração só**; a tela avisa isso.
- Tipo de documento (CPF/CNPJ) e segmento (A/J) saem do próprio dado — um "tipo" desencontrado na tela não derruba mais a geração.

## Próxima programação e seleção salva (06/10/2026)

- **Seleção salva:** os títulos marcados na Programação de Pagamento ficam no navegador (`src/lib/selecaoProgramacao.ts`, `localStorage`) e voltam ao
  reabrir a tela; a cada recarga saem da seleção os que foram pagos ou sumiram, e Pagamentos Itaú tira o que virou remessa.
- **"Próxima programação" é um lembrete, não um status.** O botão "↪ deixar pra próxima programação" (coluna Revisão, em qualquer aba) grava um
  `TituloAdiamento` (programação de origem = vencimento do título naquele momento, quem, quando, motivo opcional) **sem trocar o status de revisão e sem
  tirar o título de nenhuma lista** (`POST/DELETE /api/titulos-pagar/[id]/adiamento`). A aba "Próxima programação" lista os que têm lembrete aberto e dali
  se trata cada um: **"mandar pra remessa"** (leva o título pra Pagamentos Itaú) ou **"devolver à programação"** (tira o lembrete); marcar vários e usar
  "Enviar para remessa Itaú" no topo também vale. O lembrete se encerra sozinho (`REMESSA`) quando o título entra numa remessa gerada. O vencimento muda
  **no Senior** (o app só lê o Senior); enquanto não mudar, a linha avisa. O histórico por programação (`GET /api/titulos-pagar/adiamentos`) guarda uma
  cópia do título (nº, fornecedor, valor), então sobrevive se o sincronismo apagar/recriar o título.

## Boletos: 1 boleto para 2 títulos, repetidos e duplicados (06/10/2026)

A conferência da remessa (`conferenciaRemessa.ts`) também olha **entre** títulos/boletos, porque NF de serviço + NF de produto às vezes vêm num boleto só:

- **Mesmo boleto em 2+ itens** do carrinho → **erro** (um boleto só se paga uma vez).
- **Valor do item ≠ valor do boleto** (o valor nominal está dentro do próprio código de barras): se `valor do item + valor de outro título aberto do mesmo
  fornecedor = valor do boleto`, é **"boleto único para 2 títulos"** → **erro** com os dois títulos citados e a orientação (um item só, com o valor do
  boleto; a baixa automática na Senior não fecha os dois, a do outro é manual). Se não fecha a soma, só **aviso** (pode ser juros/multa/desconto).
- **Mesma NF + mesmo vencimento + valores diferentes** (ex.: `14A3`/`14A4` da Gestão e Negócio) sem prova de boleto próprio → **aviso** "pode ser 1 boleto
  para 2 títulos".
- **Possível título duplicado** (mesmo fornecedor, mesmo número-base e parcela, mesmo valor — ex.: `485` e `485=1`, `62698$01` e `62698$1`) → **aviso**.

**O que ainda falta pro boleto no CNAB:** o gerador de boleto (Segmento J + J-52) já existe e está validado; falta **a fonte do código de barras / linha digitável**.
O Senior não preenche `E501TCP.CODBAR` em nenhum título, então hoje alguém digita 47 dígitos por boleto (e é aí que dá erro). Caminhos: **DDA do Itaú** (lista
dos boletos emitidos contra o CNPJ, com a linha digitável — protocolos IT-000233088/091 em implantação, ver "Fase 2"), ler o PDF do boleto que chega com a NF, ou
digitar uma vez e o sistema guardar. Conta de consumo/concessionária (48 dígitos) exige outro segmento do CNAB e não está coberta.

## Simulação da geração e atualização do carrinho (06/10/2026)

- `POST /api/pagamentos-itau/remessas` aceita `simular: true`: executa tudo (conferência, gravação dos itens, montagem dos arquivos) **dentro da transação e
  desfaz no fim** — nada fica salvo. Serve pra provar que a geração completa funciona com um conjunto de dados sem criar remessa de verdade.
- A simulação também **prova o ciclo remessa → retorno** (`retornoSimulado` na resposta): monta um retorno a partir do próprio arquivo (ocorrência `00` nas posições
  231-240), lê com o leitor de retorno real e casa cada linha com o item (`lib/pagamentos/casarRetorno.ts`, o mesmo caminho do import real), tudo dentro da
  transação desfeita. Prova a consistência **interna** (formato, casamento por "Seu Número"/referência); **não** prova o que o Itaú de verdade devolve — isso só
  um retorno real prova (até 06/10/2026 nenhuma das 5 remessas geradas teve retorno importado). O leitor de retorno passou a ignorar o registro J-52.
- Os itens que já estão no carrinho **recebem os dados novos da Senior** quando a lista é relida (botão "↻ Atualizar dados dos itens", "Atualizar do Senior
  agora" ou ao reabrir a tela): CPF/CNPJ em branco é preenchido, e conta/PIX/boleto vindos da Senior substituem o do item **só se ninguém tiver digitado por
  cima** (o item guarda uma "foto" do que veio da Senior pra saber isso). O que foi digitado à mão nunca é sobrescrito.

## Rejeições do Itaú em 07/10/2026 — arquivos gerados PELA SENIOR (F510PRM), não por este sistema

Tela "Detalhamento do Resultado do Processamento da Remessa" do Itaú: **4 arquivos, todos rejeitados**. Os títulos estão em situação `PE` com `NUMPGE` da Senior (ex.: `26J6000009`), portanto o **fluxo nativo da Senior já está em uso** e gerou os arquivos. (Eu havia atribuído, por engano, esses arquivos ao nosso gerador; corrigido.)

| Arquivo (Senior) | Mensagem do Itaú | Causa — evidência |
|---|---|---|
| 7 registros de boleto (R$ 5.205,54; inclui R$ 112,00 e R$ 135,40) | "SEQUENCIA DOS SEGMENTOS INVALIDA" (+ "DADOS BOLETOS DIVERGENTES CIP", "Nº DO BANCO … INVALIDO (237)") | **CONFIRMADO**: `E030BAN.MINJ52` do Itaú (341) = **250.000** → a Senior só gera o segmento J-52 para boleto ≥ R$ 250.000 (artigo Senior 24349 / 23699). Boleto sem J-52 é rejeitado ("sequência dos segmentos"). Correção na Senior: zerar "Valor mínimo para J52" (F030BAN) e conferir que o leiaute tem o registro 11. O artigo 24349 cita também o campo do beneficiário do J-52 apontando para o CNPJ do banco (`CGCCED`) em vez do fornecedor (`NUMINS`) → "dados divergentes CIP" (a conferir no leiaute). |
| 4 TEDs (R$ 13.027,65) | "FORMA INCOMPATÍVEL COM A TITULARIDADE DO PAGAMENTO (CPF/CNPJ)" | NÃO confirmado. `MINTED` (valor mínimo para TED) está zerado, então não é essa causa. Suspeita: De/Para do tipo de pagamento (F030PPE: TED mesmo titular = 43 × outro titular = 41) ou tipo sugerido no F510PRM. Precisa do arquivo `.rem` da Senior. |
| PIX 1 item (R$ 85,38, título 007940) | "QTDE DE REGS. CALCULADA DIFER. DA QTDE INFORMADA" + "TIPO DE PAGAMENTO (SEGMENTO) NÃO INFORMADO OU INVÁLIDO" | Hipótese forte, NÃO confirmada: o título tem chave PIX `+5515131589614` marcada como telefone (é o CPF do favorecido com +55) e, segundo a Senior, "se há Tipo de Chave PIX preenchido no F510PRM, ela é priorizada sobre os dados bancários" → saiu PIX por chave inválida (registro B). Correção: no título, chave tipo CPF/CNPJ (03) com o CPF, ou apagar a chave. |

Outros achados nos mesmos títulos (leitura da Senior, 07/10): (a) vários títulos do mesmo fornecedor existem **duplicados com o mesmo valor** — `$01` em aberto e `$1` em `PE` (ex.: 62698$01 e 62698$1, R$ 42,90) → risco de pagar duas vezes; (b) formato de agência/conta inconsistente entre títulos (`11045`/`134066` sem hífen × `1961-5`/`11674-2` com DV); (c) título 007940 com `TIPTCC = 9`; (d) os títulos rejeitados continuam `PE` (presos): para refazer é preciso tirá-los da remessa no F510PRM (voltam a `AB`).

Nosso gerador já evita: J-52 sempre emitido (qualquer valor), chave PIX = CPF/CNPJ no tipo errado corrigida e avisada, forma 30/31 derivada do banco do código de barras, DV da agência/conta sem hífen sinalizado. Lição: **o manual não basta — o retorno de processamento do Itaú é o teste definitivo**; um arquivo nosso ainda não foi enviado.

## Retorno × rotina nativa de Pagamento Eletrônico da Senior (06/10/2026)

**Por que o retorno não "confere" na Senior quando a remessa nasce aqui.** Na Senior a remessa de pagamento é gravada pela rotina nativa
(**F510PPR** preparação → **F510PRM** remessa; no Senior X, "Pagamento eletrônico → Agendar pagamento"): ela gera um **Nº Remessa**, grava o
**`NUMPGE`** em `E501TCP` e muda o título para a situação **`PE` – Pagamento Eletrônico**. O retorno (**F510PRT**, ou o processo automático **155 – Retorno
Pagamento Eletrônico**) casa cada linha do banco com esse `NUMPGE` e só então liquida o título. Artigo oficial 9848 ("Título não localizado no retorno do
pagamento eletrônico"): se a remessa foi gerada **fora** da rotina da Senior, "não será mais possível processar o retorno pelo pagamento eletrônico, sendo
necessário o lançamento manual". Coluna `NUMPGE` (e `DATPRE`, `CARPRE`, `TNSPRE`, `VLRPRE`, `TITBAN`) confirmada em `E501TCP` do tenant.

**Web service pra isso?** Não há na documentação oficial: o pacote `com.senior.g5.co.mfi.cpa.titulos` tem 18 operações (consulta, gravação, baixa, estorno,
aprovação…) e **nenhuma** gera remessa ou importa retorno; a API REST `erpx_fin/fnd_contas_pagar` é **privada** e só faz CRUD/exportação de títulos
(`e501tcp`, `atualizarTituloPagar`). Gravar `NUMPGE` por fora não é documentado e não há garantia de que baste pro retorno casar — não testar em produção.

**Solução adotada: "Seu Número" no formato da Senior.** A documentação oficial do leiaute (`leiaute-de-exportacao-importacao-para-remessa-retorno-pagamento-eletronico`)
descreve que a Senior localiza o título no retorno de **duas formas** que não passam pelo `NumPge`: (a) **segmentos A e K** (crédito, TED, PIX) pelo campo **"Seu
Número"** = `0` + `CODFOR` (6) + `NUMTIT` (10) + `CODTPT` (3), 20 posições (variáveis de retorno `CodFor`, `NumTit`, `CodTpt`); (b) **segmento J** (boleto) pelo
**código de barras gravado em `E501TCP.CODBAR`**. A remessa gerada aqui passou a gravar esse "Seu Número" (`src/lib/cnab240/itau/seuNumero.ts`; coluna
`RemessaItemPagamento.seuNumero`, não única) — o retorno do Itaú devolve o mesmo valor e a tela de retorno da Senior (F510PRT / processo 155) acha o título. Limites:
`NUMTIT` > 10 caracteres, `CODFOR` > 6 dígitos ou tipo > 3 caracteres não cabem (aviso na conferência; esses seguem com a referência interna e o retorno casa só
aqui); o **alinhamento** (zeros/brancos) não é documentado — seguimos a convenção da Senior (numérico com zeros à esquerda, alfa à esquerda com brancos) e isso
**precisa de um teste real com 1 título**. O retorno aqui casa por referência interna (remessas antigas) ou por `seuNumero` (novas; entre candidatos, o que ainda
espera o banco). Boleto: o código de barras precisa estar também no título da Senior (a tela avisa quando só existe aqui). Não resolve: o que a Senior exigir além do
casamento (portador/leiaute de retorno configurado, situação do título) — confirmar no teste.

**Outros caminhos:** (1) gerar a remessa **dentro da Senior** (F510PRM / Agendar pagamento) — retorno baixa sozinho (F510PRT ou processo 155); (2) manter a
geração aqui e baixar via `GerarBaixaPorLoteCP` (implementado, ainda não validado em produção) — a Senior não marca `PE`/`NUMPGE`; (3) VAN Bancária
(Nexxera, Itaú homologado): a Senior continua gerando a remessa, mas envio e retorno ficam automáticos (exige contrato Nexxera + Skyline). O **Senior X
Banking** (eSales/BTG) é piloto e não lista Itaú. Em qualquer caminho, boleto exige o **código de barras gravado no título** da Senior (parâmetro do F030PPE).

## Leitura ao vivo da Senior pro carrinho (06/10/2026)

Achado na programação dos dias 7 e 8/10 (25 títulos, 15 "sem dados"): o sistema só enxergava o que o sincronismo agendado (script Python no VPS, **fora deste
repo**) tinha gravado. Parte do que faltava **existia na Senior** e não chegava (CPF/CNPJ da Lex perdendo zeros à esquerda; conta digitada só na OC; forma de
pagamento). Por isso, `POST /api/pagamentos-itau/dados-senior` (`src/lib/senior/dadosPagamentoTitulos.ts`) consulta a Senior **ao vivo, só leitura**, pros títulos
do carrinho e devolve, **sem gravar nada**: CPF/CNPJ, conta, chave PIX, linha digitável (se algum dia vier), forma de pagamento (`E501TCP.CODFPG` → catálogo F066FPG)
e a OC do título.

- **Ordem de confiança:** o próprio título (`E501TCP`) > cadastro do fornecedor (`E095HFO` / `E095FOR`) > **OC** (`E420OCP.USU_*`, texto livre digitado pelo
  comprador). Dado vindo da OC só entra quando a leitura é inequívoca (banco identificado pelo nome, agência ≠ conta, DAC presente; chave PIX reconhecível) e a
  tela marca **"da OC — confira"**.
- **CPF/CNPJ:** `documentoValido` recupera os zeros perdidos (campo numérico da Senior) **só se o dígito verificador fecha**.
- A tela dispara a leitura ao carregar/trazer títulos, ao adicionar um título manualmente (antes de perguntar "não tem nada na Senior", pra não afirmar isso com dado
  velho) e no botão "↻ Atualizar dados dos itens" (todos os itens). Só preenche **campo em branco** — o que foi digitado nunca é sobrescrito.
- **Forma da Senior pré-seleciona o tipo do item** (18 Boleto → segmento J; 19 PIX → forma 45) pra a conferência cobrar o dado certo (linha digitável/chave) em vez
  de "agência/conta não informadas". Boleto: a Senior **não guarda a linha digitável**, e a mensagem diz isso.
- **PRV (provisão contábil)** não aparece em "Títulos em aberto" e, se entrar no carrinho, a conferência bloqueia ("não é pagamento a fornecedor").
  **Cartão de crédito** (forma 20) gera aviso: é pago na fatura, remessa pagaria em dobro.
- **Desempenho (medido em 06/10/2026):** cada consulta à Senior leva ~1,5 s sozinha. Quatro ao mesmo tempo (ou junto da varredura em segundo plano de
  `formasPagamento.ts`, que lê todos os títulos abertos e a cada 12 h todos os títulos) ficam na fila e estouram o tempo. Por isso a leitura ao vivo faz as
  consultas **uma por vez** e, se a varredura de fundo estiver rodando, **espera ela terminar** (até 75 s). A resposta traz `completo`: só quando todas as
  consultas responderam a tela afirma "a Senior não tem nada"; senão diz que a leitura ficou incompleta.
- Limite: o sincronismo agendado continua sendo o que grava `E501TCP` no banco do app; a leitura ao vivo cobre o hiato e o que o sync não traz, mas não o substitui.

## Conteúdo do pagamento dentro da OC (06/10/2026)

No modal da OC, em "Tipo de pagamento (definido na OC)", além do código e do nome (ex.: `19 — PIX`) aparece o **conteúdo do pagamento**, conforme o tipo
da forma (`src/lib/pagamentos/conteudoPagamento.ts`, regra pura e testada):

| Forma (empresa 1) | Mostra | Se não houver |
|---|---|---|
| 1 Cobrança Bancária, 18 Boleto | código de barras (do título) | "Código de barras do boleto não foi encontrado na Sênior." |
| 19 PIX | chave PIX (da OC ou do título) | "Chave PIX não foi encontrada na Sênior." |
| 3 Depósito em Conta, 4 Ordem de Pagto | banco/agência/conta (da OC ou do título) | "Dados bancários (agência e conta) não foram encontrados na Sênior." |
| demais (cartão, fatura, remessa, dinheiro, cheque…) ou OC sem forma | o que houver de código de barras, chave PIX ou conta | "Nenhum dado de pagamento … foi encontrado na Sênior para …" |

- **Fontes:** o que o comprador digitou na própria OC (`E420OCP.USU_CHVPIX`, `USU_CODAGE`, `USU_NUMCCO`, `USU_DESCCO`, lido ao vivo — marcado "digitado na OC —
  confira") e o que a Sênior tem nos títulos que a OC gerou (`E501TCP`: `CODBAR`, `CHVPIX`/`TPCPIX`, `CODBAN`/`CODAGE`/`CCBFOR`, ou o cadastro bancário do fornecedor).
  Chave PIX: mostra o **valor da chave** (e o tipo, quando o título o traz).
- **Boleto quase sempre cai na mensagem de erro, e isso é o dado real:** a Sênior não guarda o código de barras/linha digitável em lugar nenhum — `E501TCP.CODBAR`
  vem vazio em todos os títulos e `E420OCP` (196 colunas; conferidas as OCs 14576, 15838 e 15805) não tem nenhum campo de boleto, só os `USU_` de PIX e conta.
  Só passa a aparecer quando houver fonte (DDA do Itaú, ver "Fase 2"). Cartão de crédito não tem conteúdo a exibir (e não se guarda número de cartão): cai na mensagem.
- **Consulta ao vivo que falhou** não vira "não encontrado na Sênior": o modal diz que não foi possível consultar a Sênior agora.
- **Visibilidade:** `/api/senior/aprovacoes/[numOcp]` passou a devolver o dado de pagamento de cada título (código de barras, chave PIX, conta) a quem pode abrir
  o modal — o mesmo público que já via a chave PIX/conta digitadas na OC (inclui gerência/coordenação). Se for para restringir ao financeiro, é uma checagem de papel
  nessa rota.

## Pagamentos Itaú: o que já virou remessa sai do carrinho; Histórico de pagamentos (06/10/2026)

**Problema:** o carrinho é guardado no navegador (rascunho) e voltava exatamente como foi salvo — inclusive com título que, nesse meio-tempo, já tinha virado
remessa (gerada em outra aba ou por outra pessoa, ou trazido de novo da Programação de Pagamento). Havia risco de pagar em dobro.

- **Critério de "já gerado":** o MESMO da conferência da remessa (`conferenciaRemessa.ts`) — item de remessa com status `PENDENTE`, `AGENDADO` ou `PAGO`, em remessa
  que não seja `RASCUNHO`. **Rejeitado e cancelado não contam** (o banco não pagou; o título pode ir pra uma remessa nova).
- **Carrinho:** ao abrir/recarregar a tela, os itens do rascunho que já viraram remessa saem do carrinho (e do rascunho salvo e da seleção salva da Programação) e a tela
  avisa quais foram, num banner próprio (a mensagem comum é trocada pela do resultado da leitura ao vivo da Senior e a pessoa não veria). O que fica é só o que foi
  selecionado e **ainda não foi gerado**. O envio da Programação de Pagamento ("Enviar para remessa Itaú") também deixa de fora o que já virou remessa.
- **Lista "Títulos em aberto":** títulos que já viraram remessa ficam ocultos (eles seguem abertos na Senior até a baixa), com um interruptor "mostrar também os N que já
  viraram remessa" — saída de emergência se um arquivo foi gerado mas não aceito pelo banco (fica "aguardando o banco" para sempre) e precisa ser refeito. Quando
  mostrados, levam o selo "já em remessa".
- **Histórico de pagamentos (seção nova, no fim da página):** todo pagamento já gerado, um por linha, com as mesmas informações do carrinho — título, favorecido,
  CPF/CNPJ, forma, dados de pagamento (código de barras no boleto, chave PIX no PIX, banco/agência/conta no crédito/TED), data do pagamento, valor e status — mais o
  **dia e a hora em que o arquivo remessa foi gerado** (`RemessaPagamento.geradoEm`) e o nome do arquivo. Busca por título, favorecido, CPF/CNPJ ou arquivo. Mostra os
  300 mais recentes (total informado). `GET /api/pagamentos-itau/historico` devolve os itens e também `tituloIdsGerados`, que a tela usa pra tudo acima.
