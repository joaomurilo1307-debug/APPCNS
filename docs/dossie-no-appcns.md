# Dossiê de OC gerado pelo próprio APPCNS

Botão **Gerar dossiê** na Conferência de OC (por linha ou em lote, para as OCs marcadas). Substitui o
workflow do n8n "Consominas - Dossiê OC (SeniorX) v6.4" no que importa para o financeiro: coletar na
Senior, montar o dossiê e guardar o PDF. **Não publica no GED da Senior X** (decisão de 15/10/2026).

## Como funciona

1. `POST /api/dossies/gerar` `{ ocs: [{ numOcp, codFil }] }` responde 202 na hora e marca a OC como `GERANDO`.
2. Em segundo plano, **uma OC por vez** (a Senior atende mal consultas simultâneas), `src/lib/dossie/gerar.ts`:
   - roda o fluxo (`motor.ts`): ~17 consultas GetDBInfo somente leitura → normaliza → consolida → monta o HTML (~16 s);
   - converte o HTML em PDF no **Gotenberg** (`GOTENBERG_URL`, serviço `gotenberg` do `docker-compose.yaml`);
   - grava `DossieOC` (chave `OC|filial|numero`, a mesma do n8n) e o PDF em `uploads/dossies`.
3. A lista da Conferência de OC consulta o status a cada 8 s enquanto houver `GERANDO`; termina em `PUBLICADO`
   (aparece "abrir PDF") ou `ERRO` (o motivo fica no `title` de "falhou"; "tentar de novo" refaz).
   Um `GERANDO` com mais de 15 min é considerado morto (ex.: reinício do servidor) e pode ser refeito.

Funciona para OC **sem título e sem nota fiscal** (o fluxo do n8n quebrava nesse caso; aqui a OC sem documento
fiscal cai na saída "não mapeado", que o fluxo já trata).

## De onde vem o código

`src/lib/dossie/nos/*.js` são os nós Code do workflow do n8n, **com o código original sem alterações**
(cada um dentro de uma função); `fluxo.json` guarda os demais nós (consulta, merge, splitOut, switch) e as
conexões; `motor.ts` é o mínimo do n8n que o fluxo usa. As credenciais do workflow **não** foram copiadas: o
corpo SOAP tem os marcadores `__SENIOR_USER__`/`__SENIOR_PASSWORD__`, trocados em tempo de execução por
`SENIOR_WS_SAPIENS_USER/PASSWORD`.

Para regenerar a partir de um backup do workflow:
`python scripts/dossie-extrair-n8n.py <backup-do-workflow.json> src/lib/dossie`.

## Como foi validado

- `tests/dossie-motor.test.ts` roda o fluxo com as respostas SOAP gravadas de uma execução real do n8n e compara
  **a saída de cada nó** (60+) com a do n8n. Defina `DOSSIE_ORACULO=<execucao.json>` (GET
  `/executions/{id}?includeData=true`; fica fora do repositório por conter dados de fornecedor).
- Execução ao vivo na Senior da OC 15860: o HTML gerado pelo APPCNS é **idêntico** ao do n8n (13.555 caracteres).

## Deploy

1. `docker compose pull app && docker compose up -d` (o compose novo sobe o `gotenberg`; o app já recebe
   `GOTENBERG_URL`). Se o compose do servidor tiver ajustes locais, copie só o serviço `gotenberg` e a variável.
2. Nenhuma tabela nova. Variáveis: as `SENIOR_WS_SAPIENS_*` que já existem.

## Geração automática (substitui os jobs do n8n) — 20/10/2026

Antes só o **botão** gerava no sistema; quem gerava sozinho eram dois jobs do n8n: "Disparo Dossiê pelo 201" (todo dia 06h) e o vigia de
OC quitada. Agora o próprio servidor faz isso: `src/lib/dossie/agendador.ts` confere **a cada 5 minutos, de segunda a sábado, das 6h às 21h59**
(horário de São Paulo; mesma janela do agendador do Custo por Contrato) e `src/lib/dossie/automatico.ts` decide o que gerar. Só lê a Senior.

### Por que o n8n deixava dossiês sem gerar (lido do fluxo exportado "Disparo Dossiê pelo 201", versão de 15/09)

| No n8n | Efeito |
|---|---|
| Só entravam títulos com **emissão nas últimas 24 h** (`diasRetroativos = 1`, `campoData = DATEMI`) | Título lançado dias depois da nota **nunca** entrava. É a causa mais comum. |
| `CODFIL = 1` fixo | OC de outra filial nunca. |
| Só `SITTIT` AB e LQ | Título em PE (já na remessa) ficava de fora. |
| A OC era achada por `USU_NUMTIT LIKE` + item exato | Parcela digitada pela metade ("2072$") não casava. |
| Uma falha da Senior às 06h derrubava o dia, **sem nova tentativa** | OC com erro só era tentada de novo se ainda estivesse na janela de 24 h. |
| Título sem OC saía por um ramo que não gravava nada | Ninguém via o que ficou de fora. |
| Uma OC sem título/nota fazia 3 consultas de **chave vazia** (varredura da tabela inteira na Senior: 14 a 61 s cada, medido em 20/10/2026) | A geração demorava ~3 min ou estourava o tempo. |

### O que o sistema faz agora

**Quem precisa de dossiê** (OC aprovada, `SITAPR = APR`, e não cancelada, `SITOCP <> 5`, de qualquer filial) — **só depois que a OC virou título** (29/10/2026; a regra "vence nos próximos 45 dias" foi retirada, gerava PDF sem a nota fiscal, que é achada pelo título) — qualquer uma destas:
1. tem **título em aberto** (AB/PE) citado em `USU_NUMTIT` (casamento por número exato, zeros à esquerda, parcela e base da parcela) **ou** associado à mão na
   Programação de Pagamento (`TituloOcVinculo`) — vale mesmo que o vencimento da OC seja antigo ou esteja vazio;
2. já está **paga** no sistema (`AprovacaoSenior.pago`) e venceu nos últimos **90 dias** — o dossiê final que o vigia gerava.

**O que faz com cada uma** (compara com o dossiê guardado; `DossieOC.assinatura` = estado da OC quando o PDF foi feito: aprovação, situação, valor,
títulos e nota digitados e quais títulos ainda estão abertos na Senior):
- sem dossiê, ou sem PDF, ou o PDF sumiu do servidor → **gera** (primeiro as que nunca tiveram, e as que vencem mais perto de hoje);
- a assinatura mudou (título novo, título **pago**, nota, valor, situação) → **gera de novo**;
- dossiê feito pelo n8n ou pelo botão (sem assinatura): se ele cita os títulos da OC, é **adotado** (só registra a assinatura, não refaz o PDF); se não cita, refaz;
- falhou → tenta de novo **sozinho** com intervalo crescente: 5 min, 15, 30, 1 h, 2 h, 4 h, 8 h e depois a cada 24 h, para sempre (`DossieOC.tentativas`);
- no máximo **12 por verificação** (`DOSSIE_AUTO_LOTE`), uma de cada vez; 3 falhas seguidas param a verificação; sem o Gotenberg a verificação não gera nada nem marca erro.

**Onde acompanhar:** painel **Dossiês automáticos** no topo da Conferência de OC (quantas OCs precisam de dossiê, quantas estão em dia, o que falta e **por quê**,
"Verificar agora"). Para monitor externo: `GET /api/senior/dossies/automatico` com o header `x-sync-key` (`ultimo.terminouEm` mostra se está vivo; `ultimo.pendentes`).

**Variáveis (todas opcionais, no `.env` do servidor / compose):** `DOSSIE_AUTO=0` desliga o agendador; `DOSSIE_AUTO_DIAS_ATRAS` (30), `DOSSIE_AUTO_DIAS_FRENTE` (45),
`DOSSIE_AUTO_DIAS_ATRAS_PAGAS` (90), `DOSSIE_AUTO_LOTE` (12), `DOSSIE_AUTO_JANELA_OCS` (2500 = quantas das últimas OCs a Senior lê por verificação).

### Segurança da Senior (por que não derruba nada)

- **Fila única:** todas as chamadas à Senior (as telas, a leitura de custos e o motor do dossiê) passam por `emFilaSenior` — uma por vez no processo.
- **Consulta sem chave não sai:** o motor (`motor.ts`) não envia à Senior a consulta cujo parâmetro de chave (`NumNfc`, `NumTit`, `CodFor`...) está vazio e devolve "zero linhas".
  O HTML do dossiê é **idêntico** ao de antes (OC 15182: 11.703 caracteres nos dois casos), mas a geração de uma OC sem título/nota caiu de **171 s para 11 s**.
- Uma verificação completa lê só 3 coisas na Senior (~9 s): as últimas OCs, os títulos em aberto e, só para a lista do que falta, o nome dos fornecedores.

### Quando desligar o n8n

Depois de **um dia** com o painel verde (ou só com itens "aguardando nova tentativa"), desative no n8n o job `Disparo Dossiê pelo 201` e o vigia de OC quitada.
Os dois podem conviver: gravam pela mesma chave por OC e o sistema só refaz o que mudou. O que deixa de existir é a **publicação no GED** (decisão de 15/10).

**Pré-requisito em produção:** o serviço `gotenberg` do `docker-compose.yaml` precisa estar no ar (`docker compose up -d` com o compose novo). Sem ele o painel
mostra "o serviço que converte o dossiê em PDF (Gotenberg) não respondeu" e nada é gerado.

## Convivência com o n8n

O job das 6h (`Disparo Dossiê pelo 201`) continua gravando pela mesma chave por OC. Gerar de novo substitui o
PDF anterior (o antigo sai do disco). Quando o botão estiver validado em produção, os jobs do n8n podem ser
desativados (o que deixa de existir: a publicação no GED).

## Conteúdo completo do dossiê (29/10/2026)

`src/lib/dossie/complemento.ts` + `danfe.ts` acrescentam ao HTML do fluxo (o gerador deixa os marcadores `<!--COMPLEMENTO_OC-->` e `<!--COMPLEMENTO_DANFE-->`; `gerar.ts` troca):

- **Dados da Ordem de Compra:** fornecedor, CNPJ/CPF, endereço, inscrição estadual, condição de pagamento (E028CPG), forma de pagamento (**só o código** — não achei a tabela de descrição via GetDBInfo), valor da OC e saldo, **observações da OC** (`OBSOCP`). Rateio, aprovadores e itens já vinham do fluxo.
- **Item reembolsável:** aviso + itens e valores + CNPJ do fornecedor quando algum rateio tem conta financeira **>= 180** (`CONTA_REEMBOLSAVEL_A_PARTIR_DE`) ou `USU_REEMB = 'S'`.
- **Sem nota fiscal:** aviso destacado quando o título não leva a nenhuma nota no ERP.
- **DANFE completa por nota**, montada com os dados da nota na Senior (E440NFC/E440IPC/E440ISC, emitente E095FOR, destinatário E070FIL, transportadora E073TRA). **Não é o PDF oficial** (o ERP não guarda protocolo de autorização nem XML — a página diz isso). Nota sem chave NF-e sai como "espelho da nota fiscal".
- **OC liquidada:** a Senior zera o saldo (`VLRLIQ`) e o valor fica em `VLRORI`/`VLRBRU`; o gerador agora usa o primeiro valor > 0 (antes mostrava R$ 0,00).
- Falha em qualquer consulta do complemento = dossiê em ERRO e nova tentativa automática (não sai PDF parecendo completo e incompleto).
- O `gerar-html-do-dossie.js` **foi alterado** em relação ao n8n (espelho simples removido, marcadores, valores). Não regenerar com `dossie-extrair-n8n.py` sem refazer isso. O teste `dossie-motor` contra o gabarito do n8n vai divergir no nó "Gerar HTML do Dossiê" por esse motivo.

## Melhorias de 11/11/2026 (histórico, rateio, reembolsável, locação, anexos)

O gerador do fluxo deixa mais dois marcadores, `<!--COMPLEMENTO_ITENS-->` (Produtos, Serviços e Rateios) e `<!--COMPLEMENTO_HISTORICO-->`; as quatro seções saíram do código herdado do n8n e são montadas pelo complemento.

- **Histórico do fornecedor = os 3 últimos pagamentos** (`historico.ts`). Antes eram as 3 últimas OCs aprovadas com `SITOCP = 1`, ligadas ao título pelo texto livre `USU_NUMTIT` — por isso não batia: OC paga saía da lista, OC sem título digitado ficava sem pagamento e o prazo contava da data da OC. Agora a fonte é o contas a pagar (`E501TCP`) do fornecedor e dos cadastros do mesmo grupo de empresas (`CODGRE`), todas as filiais, pela data do último pagamento (`ULTPGT`). Entra título com pagamento registrado (saldo menor que o valor, inclusive parcial); sai título cancelado e os títulos da própria OC. Colunas: título, NF, OC (`USU_NUMOCP`), emissão, vencimento (prorrogado, se houver), pago em, valor, valor pago (e o que resta), prazo emissão → pagamento e "em dia". O alerta `SEM_HISTORICO_PAGAMENTO_FORNECEDOR` do fluxo antigo foi retirado (contradizia a tabela nova). Os nós antigos do histórico ainda rodam no fluxo (não foram tirados para não mexer nas junções do grafo), mas o resultado deles não aparece mais.
- **Rateio como fatia do item** (`itens.ts`). A Senior grava uma linha de rateio por item (`SEQIPO`/`SEQISO`) e centro de custo, e os percentuais nem sempre somam 100 no item (na OC 15857 cada linha tem `PERRAT = 100`), o que fazia o dossiê mostrar "100%" e, quando o valor gravado não servia, o valor cheio. Agora o valor de cada linha é recalculado sobre o valor do item (linha sem item: valor da OC): (1) `PERCTA × PERRAT` quando fecha 100% no item; (2) senão a proporção de `VLRRAT` (depois `VLRCTA`); (3) senão partes iguais. A soma das linhas de um item fecha com o valor do item (centavos na última linha) e a tabela traz o item de cada linha e o total rateado (avisa se não bate com o total dos itens). A `E420RAT` é lida com `SELECT *` (o fluxo já fazia assim) e os nomes de centro de custo/conta vêm de `E044CCU`/`E091PLF` — se essa consulta falhar, a linha mostra só o código.
- **Coluna "Reembolsável" (SIM/NÃO)** depois do valor em Produtos, Serviços e Rateios. Regra (validada com o Gabriel em 11/11): linha de rateio = conta financeira **>= 180**; item = SIM se alguma linha de rateio dele for reembolsável (sem linha própria, vale o rateio geral da OC); `USU_REEMB = 'S'` na OC marca todos os itens. "Dados da Ordem de Compra" ganhou o campo **Despesa reembolsável**: Não / Sim (toda a OC) / **Mista** (com o valor de cada parte, pelo rateio). O aviso "ITEM REEMBOLSÁVEL" lista só os itens reembolsáveis.
- **Fatura de locação** (`locacao.ts`): quando a OC **não tem nota fiscal** e algum item é de locação pela descrição (`LOCAÇÃO`, `ALUGUEL`, `LOCADO`...; "alocação"/"colocação" não contam), no lugar do aviso "SEM NOTA FISCAL" entra um aviso leve e, no fim, o **espelho da fatura de locação** no mesmo padrão da DANFE: locador (E095FOR), locatário (E070FIL), título(s) do contas a pagar, bens locados (itens da OC), totais e observações da OC. Não é a fatura emitida pelo locador (a página diz isso). Com nota lançada, a locação segue com a DANFE.
- **Anexos — botão "editar dossiê"** (Conferência de OC, ao lado de "abrir PDF"; Programação de Pagamento, ao lado de "abrir dossiê"). PDF, JPG ou PNG (tipo conferido pelo conteúdo; PDF com senha ou corrompido é recusado), até 15 MB cada, 50 MB e 20 arquivos por dossiê. Ficam em `DossieAnexo` + `UPLOAD_DIR/dossies-anexos` e **não alteram o PDF gerado**: quem entrega o dossiê (`lerPdfDoDossie`, usado em "abrir PDF", no ZIP da Conferência e no pacote da Programação) junta o PDF + uma página "Anexos do dossiê" com a lista + as páginas de cada anexo. Assim a geração automática pode refazer o dossiê sem perder os anexos. Mesmo acesso de quem abre o dossiê; incluir/remover fica no log de auditoria (`DOSSIE_ANEXO_INCLUIDO`/`DOSSIE_ANEXO_REMOVIDO`). Junção feita com `pdf-lib` (sem depender do Gotenberg).
- **Regeração dos dossiês antigos** (`versao.ts`): a assinatura da geração automática passou a levar a versão do conteúdo (`VERSAO_DOSSIE = "2026-11-11"`). Dossiê de versão anterior — ou do n8n, sem assinatura — fica "desatualizado" e é refeito pela geração automática **depois** dos que faltam e dos que mudaram (prioridade 3), no ritmo normal (12 a cada 5 minutos), só dentro da janela automática. O botão manual grava `"<versão>:manual"` e é adotado. Mudou o que o PDF mostra de novo? Troque a data em `versao.ts`.
- **Não validado com dados reais:** a credencial da Senior do `.env` local estava recusada em 11/11 ("inválidas/desabilitadas/expiradas"). Tudo acima foi testado com consultas simuladas (inclusive o rateio real da OC 15857) e com a tela/HTTP no ambiente de homologação local; conferir o primeiro lote em produção.
