# Custo de pessoal por centro de custo

Tela **Custo de Pessoal** (`/custo-pessoal`) e aba **Custo de pessoal** do contrato (`/contratos/<ccu>?aba=pessoal`). Mostra a folha dos **CLT** de **todos os centros de custo**, calculada no Senior (HCM/Rubi + ERP) com a regra do Rito de Gestão: total por centro de custo e mês, quanto gasta com o quê e, ao abrir um valor ou um centro, a folha pessoa a pessoa. Filtro por grupo: **Núcleos ADM** (15), **Engenharia**, **Ambiental** e **Outros** (grupos pela área de `src/lib/areas.ts`; centro sem área cai em "Outros").

Em 27/10/2026 a tela era só dos 15 núcleos ADM; em 28/10/2026 o João pediu todos os centros (e todos os contratos) para ele poder validar.

## Regra do total (a mesma do Rito, conferida ao centavo)

`líquido da folha (rubricas 3065 + 2454) + rescisão paga pelo ERP (conta 80) + INSS (2000) + FGTS (2500) + IRRF (2004) + as provisões do mês (férias, 1/3 de férias, 13º, INSS e FGTS sobre a provisão)`.
A provisão já embute o encargo patronal: não se soma FGTS/INSS avulso por cima. Código: `src/lib/custoPessoal/componentes.ts`.

- **Só CLT** (tipo de colaborador 1 no HCM). Prestadores PJ (tipo 2, como o grupo "ADM", CCU 260) já estão em Serviços Terceiros PJ no Custo por Centro de Custo; somar de novo duplicaria.
- **Diretoria (CCU 390):** os 3 são CLT no Senior mas recebem **pró-labore** (rubrica 1600), sem provisão. O pró-labore aparece à parte e **fora** da "regra do Rito"; o total mostrado na visão geral inclui o pró-labore.
- **Outubro/2026:** só entra quando a folha de outubro estiver calculada no Senior (o cálculo 478 tinha 5 pessoas). O cálculo 476 (diferença de férias, sem líquido) não é somado, como no Rito.
- **Códigos de CC:** HCM e ERP diferem em alguns centros (ADM MARKETING é o **21 no HCM e o 17 no sistema**; o 17 do HCM é um contrato). O `codccu` do banco é sempre o do **sistema**; `ccuHcm` guarda o da folha. O casamento é pelo nome do centro e, quando o nome difere, pelo mapa manual `scratchpad/custo_pessoal_mapa_ccu.py` (só quem tem o mesmo número de contrato no nome; o resto fica com o código do HCM).

## Qual centro de custo vale em cada mês

O HCM guarda o **histórico** de centro de custo de cada pessoa (tabela `R038HCC`, toda mudança em 2026 foi no dia 1 do mês). O centro do mês é o vigente no **último dia** do mês. Esse método reproduz as 389 linhas ADM já conferidas com o Rito (mar–set) sem nenhuma diferença.

- **Jan e fev/2026 (distribuição):** até 28/02 todo o pessoal ADM ficava no centro único "ADM" (260); em 01/03 cerca de 53 pessoas foram para os núcleos. O custo de jan/fev dessas pessoas foi **distribuído para o núcleo em que estão desde março** (`origemCc = distribuido_nucleo`, selo "distribuído" na folha). Quem saiu do ADM antes de março continua no 260.
- **Confirmado pelo João:** Elisangela (mat. 2080) ficou na ALCOA PR 052 (CCU 102215) em jan e fev (`confirmado_joao`); o cadastro do Senior diz 260.
- **De março em diante:** nada do que já estava carregado e conferido muda (pedido do João, 28/10/2026); a carga nova só acrescenta os centros de contrato e jan/fev. A trava `scratchpad/custo_pessoal_confere_adm.py` compara linha a linha antes de qualquer carga.

## Memória: mês fechado não muda

Pedido do João (28/10/2026): os meses para trás ficam como memória e não mudam; daqui para frente só se acrescenta o mês novo.

- Tabela `CustoPessoalFechamento` (um registro por mês fechado): data, resumo (linhas, pessoas, total) e **impressão SHA-256** das linhas do mês (centro, matrícula e cada valor em centavos; nome e situação atual não entram). Código: `src/lib/custoPessoal/fechamento.ts`.
- A carga (`POST /api/senior/custo-pessoal/sync`) **recusa com 409** qualquer mês fechado. `fechar: true` na mesma carga fecha os meses enviados; mês sem folha não fecha.
- `POST /api/senior/custo-pessoal/fechamento` (mesma chave): `acao: "fechar"` (meses já carregados) ou `acao: "reabrir"` (**excepcional**: exige `motivo` de pelo menos 10 caracteres e fica na auditoria como `custo_pessoal.reabrir_mes`, com a impressão que valia).
- `GET /api/senior/custo-pessoal/sync` mostra, por mês, se está fechado e se a impressão **ainda confere** (detecta alteração direta no banco). Testado: mexer 1 centavo numa linha de mês fechado vira "IMPRESSÃO NÃO CONFERE".
- A tela mostra a faixa "Meses fechados: … não mudam mais".
- Ao fechar pelo script, a cópia de cada mês vai para `grupo-consominas-engenharia/Custo de pessoal/fechamentos/aaaa-mm.json` (backup fora do banco).

## Atualização mensal (acrescentar, nunca refazer)

1. Quando a folha do mês estiver calculada no Senior, descobrir o(s) `CODCAL` do mês (tabela `R044CAL`).
2. `python scratchpad/custo_pessoal_senior.py <saida.json> --codcal=aaaa-mm=<cod[+cod]> --meses=aaaa-mm` (só leitura; calcula só o mês novo).
3. `python scratchpad/sync_custo_pessoal.py <saida.json> producao carregar aaaa-mm` e conferir a tela; depois de validado, `carregar-e-fechar` (ou `fechar-meses aaaa-mm`).
4. Modos do `sync_custo_pessoal.py`: `carregar`, `carregar-e-fechar`, `conferir`, `fechar-meses`, `reabrir-meses`.

**Pendente:** agendar isso (hoje roda manual); depende de onde a rotina vai rodar, porque o acesso ao Senior e as chaves estão neste computador.

## Acesso (dado de remuneração)

Módulo **exclusivo** `custo_pessoal` (grupo próprio "Custo de pessoal" no painel Usuários > Acesso): **nem o ADMIN entra sozinho**; só quem tem a liberação gravada. Nenhum perfil pronto o inclui (nem o "financeiro"). **Decisão do João (28/10/2026): por enquanto só ele e a conta administrativa que ele usa** (`admin@consominas.com.br`; os outros ADMIN, como Gabriel e Renata, ficam de fora). `prisma/seed-acesso-custo-pessoal.ts` libera, no boot, nível VER para a matrícula 2074 e para essa conta (marca `seed.acesso-custo-pessoal.conta.<email>`) e retira (uma vez) as liberações dadas antes a Carolina, André, Elaine, Virginia e Kathleen. As APIs devolvem 403 sem o módulo e a página redireciona para o início; na aba do contrato, quem não tem o módulo vê só o aviso de que o dado é restrito. Cada abertura da folha de um centro (`/api/custo-pessoal/pessoas`) é registrada na auditoria (`custo_pessoal.ver_folha`).

**Para liberar mais gente:** painel Usuários > Acesso, módulo "Custo de pessoal" (vale também para outro administrador). Salvar o painel de um ADMIN mantém a liberação dele (`sobreposicoesParaGravar`). O servidor guarda o acesso em memória por 20 s, então uma mudança leva até 20 s para valer.

## Dados

- Tabela `CustoPessoalMes` (uma linha por pessoa, mês e centro): componentes, cargo, situação atual no Senior, nome do centro (`nomeCentro`, para centros fora do cadastro de áreas) e origem do centro de custo do mês (`historico_hcm`, `distribuido_nucleo`, `confirmado_joao`).
- **Carga:** `POST /api/senior/custo-pessoal/sync` (chave `x-sync-key`): **substitui os meses enviados que ainda estão abertos**; recusa a carga inteira se o código do centro for inválido, o mês não estiver na lista, houver linha repetida ou o total não bater com os componentes.
- Testes: `tests/custo-pessoal.test.ts` (regra do total, agregação, escopo e grupos, validação da carga, impressão e fechamento, módulo e acesso).

## Rollback

Reverter o PR; ou esvaziar as tabelas (`DELETE FROM "CustoPessoalFechamento"; DELETE FROM "CustoPessoalMes"`) e tirar o item do menu; ou revogar o módulo no painel. Nada é gravado no Senior. Antes de recarregar produção fica a cópia do que estava lá (ver `scratchpad/sync_custo_pessoal.py ... conferir`) e os JSONs gerados.
