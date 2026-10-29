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
