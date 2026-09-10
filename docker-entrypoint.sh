#!/bin/sh
set -e

echo "Aplicando schema no banco..."
npx prisma db push --skip-generate --accept-data-loss

if [ "$RUN_SEED" = "true" ]; then
  echo "Rodando seed..."
  npx tsx prisma/seed.ts || true
fi

if [ "$RUN_SEED_SENIOR" = "true" ]; then
  echo "Rodando seed Senior (equipes por centro de custo)..."
  npx tsx prisma/seed-senior-teams.ts || true
fi

if [ "$RUN_FIX_NOMES" = "true" ]; then
  echo "Normalizando caixa dos nomes de usuario..."
  npx tsx prisma/fix-nomes-caixa.ts || true
fi

if [ "$RUN_SEED_CONTRATOS" = "true" ]; then
  echo "Substituindo projetos antigos pelos contratos ativos do Senior..."
  npx tsx prisma/seed-contratos-projetos.ts || true
fi

if [ "$RUN_BACKFILL_CODCCU" = "true" ]; then
  echo "Preenchendo Team.codccu a partir do nome das equipes..."
  npx tsx prisma/backfill-codccu-teams.ts || true
fi

if [ "$RUN_MERGE_FIN" = "true" ]; then
  echo "Fundindo Analise e Estrategia dentro de Financeiro (equipe + nucleo)..."
  npx tsx prisma/merge-financeiro-analise.ts || true
fi

if [ "$RUN_SEED_NUCLEOS" = "true" ]; then
  echo "Reestruturando nucleos (setores ADM + Engenharia Ambiental/Civil)..."
  npx tsx prisma/seed-nucleos-v2.ts || true
fi

if [ "$RUN_WIPE_PROJ" = "true" ]; then
  echo "Apagando todos os projetos e tarefas (reconfiguracao)..."
  npx tsx prisma/wipe-projetos-tarefas.ts || true
fi

if [ "$RUN_WIPE_EQ" = "true" ]; then
  echo "Apagando todas as equipes e nucleos (clean slate)..."
  npx tsx prisma/wipe-equipes-nucleos.ts || true
fi

echo "Iniciando aplicacao..."
exec npx next start -p 3000
