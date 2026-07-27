# Consominas - Gestão de Projetos e Rotinas

Ferramenta interna (uso exclusivo Consominas) para gestão de projetos, equipes e rotinas.

## Stack
Next.js 14 + Prisma + PostgreSQL + NextAuth, empacotado em Docker.

## Rodando localmente
```bash
cp .env.example .env
docker compose up --build
```
Acesse http://localhost:3000. Um usuário admin é criado pelo seed (ver `.env`).
