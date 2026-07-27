#!/bin/sh
set -e

echo "Aplicando migrations do banco..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "Rodando seed..."
  npx tsx prisma/seed.ts || true
fi

echo "Iniciando aplicacao..."
exec npx next start -p 3000
