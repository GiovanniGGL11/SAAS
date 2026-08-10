# Meu Negócio

SaaS multi-tenant de agendamentos para barbearias, salões, clínicas de estética, manicures, lash designers e qualquer negócio baseado em hora marcada.

Esta é a **Fase 1**: fundação técnica (auth multi-tenant, banco, shell do dashboard) + o núcleo do módulo de **Agenda**. Demais módulos (Clientes, Profissionais, Financeiro, Estoque, Marketing, IA, etc.) vêm em fases seguintes — ver plano completo em `C:\Users\ketll\.claude\plans\functional-conjuring-mountain.md`.

## Stack e versões instaladas

- **Next.js `16.2.10`** (App Router) — usa `src/proxy.ts`, não `middleware.ts` (renomeado no Next.js 16; funcionalidade idêntica)
- React `19.2.4`, TypeScript `^5` (strict)
- Tailwind CSS `^4`
- **Shadcn/UI**, estilo `radix-nova` (Radix UI) — o estilo padrão atual do CLI (`base-nova`) usa `@base-ui/react` em vez de Radix e tem componentes incompletos no registry (ex: `form` é um stub vazio em todos os estilos no momento); pinado explicitamente para `-b radix` por estabilidade
- **Prisma `^7.8.0`** + PostgreSQL (Supabase) — Prisma 7 exige driver adapters; `DATABASE_URL`/`DIRECT_URL` vivem em `prisma.config.ts`, não no `schema.prisma`; o client da app usa `@prisma/adapter-pg` (ver `src/lib/db.ts`)
- **Clerk `^7.7.1`** (auth + Organizations = tenants). API de tema mudou nesta major: `appearance.baseTheme` → `appearance.theme` (ver `src/components/clerk-provider.tsx`)
- `next-themes` (dark/light), `motion` (sucessor do framer-motion), `lucide-react`
- `@dnd-kit/core` (drag-and-drop da agenda), `@tanstack/react-query`
- `react-hook-form` + `zod` + `@hookform/resolvers`, `cmdk` (combobox de busca)
- `vitest` (testes)

## Setup local

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha:
   - **Supabase**: `DATABASE_URL` (Transaction pooler, porta 6543) e `DIRECT_URL` (Direct connection, porta 5432) — em Project Settings → Database
   - **Clerk**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (dashboard do Clerk) e `CLERK_WEBHOOK_SIGNING_SECRET` (após criar o endpoint de webhook, ver abaixo)
   - No dashboard do Clerk, habilite **Organizations**
3. `npm run db:migrate` (cria as tabelas) — depois `npm run db:seed` (empresa demo com profissionais/serviços/clientes/agendamentos)
4. `npm run dev` e abra [http://localhost:3000](http://localhost:3000)

### Webhook do Clerk (sincronização Organization → Company)

Em dev, exponha `localhost:3000` (ex: `ngrok http 3000`) e cadastre no dashboard do Clerk um endpoint apontando para `https://<seu-tunnel>/api/webhooks/clerk`, assinando os eventos `organization.created`, `organization.updated`, `organization.deleted`. Copie o **Signing Secret** gerado para `CLERK_WEBHOOK_SIGNING_SECRET`.

Sem o webhook configurado, o app ainda funciona: `requireCurrentCompany()` provisiona a empresa sob demanda no primeiro acesso ao dashboard (mesmo `upsert` idempotente do webhook) — só não há sincronização automática de nome/exclusão da organização.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run test` | Roda a suíte de testes (Vitest) uma vez |
| `npm run test:watch` | Vitest em modo watch |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Popula a empresa demo (`prisma/seed.ts`) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:generate` | Regenera o client Prisma (`src/generated/prisma`, git-ignorado) |

## Arquitetura — segurança multi-tenant

`src/proxy.ts` (Clerk `clerkMiddleware`) é **só a primeira camada**: redireciona usuários deslogados antes de renderizar `/dashboard` e `/onboarding`. Não é a fonte de verdade de autorização.

Toda leitura/escrita de dados de empresa passa por **`requireCurrentCompany()`** (`src/server/auth/require-current-company.ts`), chamado no topo de toda Server Action, Route Handler e página server-side — resolve `userId` + `orgId` do Clerk em uma `Company` interna, memoizado por request via `React.cache()`.

A camada de acesso a dados (`src/server/data/*.ts`) nunca confia em `id` sozinho: toda leitura/escrita usa `findFirst`/`updateMany` com `{ id, companyId }` — nunca `findUnique`/`update` só por `id`. `createAppointment` revalida que cliente/profissional/serviço pertencem à mesma empresa antes de conectar, mesmo que o chamador já devesse ter escopado a busca.

## Testes

`npm run test` roda 4 suítes:

- **`no-active-org.test.ts`** — não precisa de banco (mocka `@clerk/nextjs/server`); valida que a sessão é rejeitada antes de qualquer acesso a dados.
- **`tenant-isolation.test.ts`**, **`appointment-conflict.test.ts`**, **`appointment-lifecycle.test.ts`** — precisam de `DATABASE_URL`/`DIRECT_URL` reais (cada teste cria e destrói sua própria `Company` descartável, sem fixture compartilhada).

## Estrutura

```
src/
  app/(auth)/            sign-in, sign-up (Clerk)
  app/(dashboard)/       layout autenticado (sidebar, topbar) + dashboard, agenda
  app/onboarding/        criação/seleção de empresa (Clerk Organizations)
  app/api/webhooks/clerk/  sync Organization → Company
  components/agenda/     grade de horários, toolbar, drawers de criar/editar
  components/layout/     sidebar, topbar, nav mobile, theme toggle
  components/ui/         primitivos shadcn/ui
  lib/                   db (Prisma client), time (helpers de timezone), serialize, validations
  server/auth/           requireCurrentCompany
  server/data/           camada de acesso a dados (escopada por companyId)
  server/actions/        Server Actions da Agenda
prisma/                  schema.prisma, seed.ts, migrations/
tests/                   Vitest
```
