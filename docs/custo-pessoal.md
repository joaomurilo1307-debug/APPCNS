# Custo de pessoal por centro de custo (núcleos ADM)

Tela **Custo de Pessoal** (`/custo-pessoal`) e aba **Custo de pessoal** do contrato (`/contratos/<ccu>?aba=pessoal`). Mostra a folha dos **CLT** dos 15 núcleos ADM, calculada ao vivo no Senior (HCM/Rubi + ERP) com a regra do Rito de Gestão: total por centro de custo e mês, quanto gasta com o quê e, ao abrir um valor ou um centro, a folha pessoa a pessoa. Por enquanto **só os centros ADM** (decisão do João, 27/10/2026); centros de contrato entram depois.

## Regra do total (a mesma do Rito, conferida ao centavo)

`líquido da folha (rubricas 3065 + 2454) + rescisão paga pelo ERP (conta 80) + INSS (2000) + FGTS (2500) + IRRF (2004) + as provisões do mês (férias, 1/3 de férias, 13º, INSS e FGTS sobre a provisão)`.
A provisão já embute o encargo patronal: não se soma FGTS/INSS avulso por cima. Código: `src/lib/custoPessoal/componentes.ts`.

- **Só CLT** (tipo de colaborador 1 no HCM). Prestadores PJ (tipo 2, como o grupo "ADM", CCU 260) já estão em Serviços Terceiros PJ no Custo por Centro de Custo; somar de novo duplicaria.
- **Diretoria (CCU 390):** os 3 são CLT no Senior mas recebem **pró-labore** (rubrica 1600), sem provisão. O pró-labore aparece à parte e **fora** da "regra do Rito"; o total mostrado na visão geral inclui o pró-labore.
- **Período:** março a setembro/2026. Jan/fev ficam fora (≈48 pessoas mudaram de CC em 01/03/2026 e o HCM não guarda o CC anterior). Outubro sem folha calculada (CODCAL 478 tem só 5 pessoas). O cálculo 476 (diferença de férias, sem líquido) não é somado, como no Rito (~R$ 9,7 mil de INSS+FGTS+IRRF na empresa toda).
- **Códigos de CC:** HCM e ERP diferem em alguns centros. ADM MARKETING é o **21 no HCM e o 17 no sistema** (o 17 do HCM é um contrato). `src/lib/custoPessoal/escopo.ts` traz os dois.

## Conferência

Calculado ao vivo no Senior e comparado com o que o Rito já tinha guardado (mar–ago): **84/84 combinações núcleo × mês e todas as pessoas batem ao centavo**. Setembro: R$ 301.244,63 (regra do Rito) + R$ 4.863,00 de pró-labore, 56 pessoas CLT com folha. Planilha de conferência: `grupo-consominas-engenharia/Custo de pessoal ADM/`.

## Acesso (dado de remuneração)

Módulo **exclusivo** `custo_pessoal` (grupo próprio "Custo de pessoal" no painel Usuários > Acesso): **nem o ADMIN entra sozinho**; só quem tem a liberação gravada. Nenhum perfil pronto o inclui (nem o "financeiro"). **Decisão do João (28/10/2026): por enquanto só ele.** `prisma/seed-acesso-custo-pessoal.ts` libera, no boot, nível VER para a matrícula 2074 e retira (uma vez) as liberações dadas antes a Carolina, André, Elaine, Virginia e Kathleen. As APIs devolvem 403 sem o módulo e a página redireciona para o início. Cada abertura da folha de um centro (`/api/custo-pessoal/pessoas`) é registrada na auditoria (`custo_pessoal.ver_folha`).

**Para liberar mais gente:** painel Usuários > Acesso, módulo "Custo de pessoal" (vale também para outro administrador). Salvar o painel de um ADMIN mantém a liberação dele (`sobreposicoesParaGravar`). O servidor guarda o acesso em memória por 20 s, então uma mudança leva até 20 s para valer.

## Dados e atualização

- Tabela `CustoPessoalMes` (uma linha por pessoa, mês e centro): componentes, cargo, situação atual no Senior, origem do centro de custo do mês.
- **Carga:** `POST /api/senior/custo-pessoal/sync` (chave `x-sync-key`), sempre **substitui os meses enviados** (espelho), recusa a carga inteira se um centro não for ADM, o mês não estiver na lista, houver linha repetida ou o total não bater com os componentes. `GET` (mesma chave) devolve linhas e total por mês, para conferir sem login.
- **Fonte:** `scratchpad/custo_pessoal_adm_senior.py` (só leitura; HCM + ERP + ledger do Rito) e `scratchpad/sync_custo_pessoal_adm.py <json> producao` (envia). Para um mês novo: acrescentar o `CODCAL` do mês em `CODCALS` do script, rodar e enviar. **Pendente:** rotina mensal automática (hoje manual).
- Testes: `tests/custo-pessoal.test.ts` (regra do total, agregação, escopo, validação da carga, módulo e acesso).

## Rollback

Reverter o PR; ou esvaziar a tabela (`DELETE FROM "CustoPessoalMes"`) e tirar o item do menu; ou revogar o módulo no painel. Nada é gravado no Senior.
