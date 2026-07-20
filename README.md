# Meu Negócio

SaaS multi-tenant de agendamentos para barbearias, salões, clínicas de estética e negócios baseados em hora marcada.

## Stack e versões instaladas

- Next.js `16.2.10` (App Router) — usa `proxy.ts` (não `middleware.ts`; renomeado no Next.js 16)
- React `19.2.4`
- TypeScript `^5`
- Tailwind CSS `^4`
- Prettier + `prettier-plugin-tailwindcss`
- Shadcn/UI (`radix-nova` style — base Radix UI, não o `base-nova`/`@base-ui` experimental que vem por padrão no CLI atual)
- `next-themes` (dark/light), `motion` (sucessor do framer-motion), `lucide-react`
- `@dnd-kit/core` (drag-and-drop da agenda), `@tanstack/react-query`
- `react-hook-form` + `zod` + `@hookform/resolvers`

Módulos adicionados progressivamente (Prisma, Clerk, Shadcn/UI, etc.) serão documentados aqui conforme instalados. Ver plano completo em `C:\Users\ketll\.claude\plans\functional-conjuring-mountain.md`.

## Setup local

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha as variáveis (Clerk, Supabase/Postgres).
3. `npx prisma migrate dev` (após o schema existir)
4. `npm run dev`

## Getting Started (Next.js padrão)

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).
