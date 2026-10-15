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

## Convivência com o n8n

O job das 6h (`Disparo Dossiê pelo 201`) continua gravando pela mesma chave por OC. Gerar de novo substitui o
PDF anterior (o antigo sai do disco). Quando o botão estiver validado em produção, os jobs do n8n podem ser
desativados (o que deixa de existir: a publicação no GED).
