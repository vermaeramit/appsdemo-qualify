# AppsDemo Qualify

A multi-tenant SaaS that qualifies inbound leads (Meta lead forms, Click-to-WhatsApp ads, inbound API) through an AI agent on the **business's own WhatsApp number**. It scores each lead (rules + AI intent) and returns results by **Excel or webhook**. It is a qualification engine, **not a CRM**.

- Production: `qualify.appsdemo.in` · Staging: `qualify-staging.appsdemo.in`
- First customer: a travel company (domestic + international tour packages), ~200–300 leads/day from Meta ads
- Meta: AppsDemo business portfolio is verified. We are going the **direct Tech Provider** route, with **Coexistence** as the default onboarding.

## Docs (read before working)
- [docs/PRD.md](docs/PRD.md): what we're building and why, functional requirements
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, multi-tenancy, data model, conversation engine, deployment
- [docs/DECISIONS.md](docs/DECISIONS.md): decision log (append-only)
- [docs/MILESTONES.md](docs/MILESTONES.md): M0–M8 plan, prerequisites, acceptance criteria

## Stack (summary)
Full-stack TypeScript, pnpm 12 monorepo, Node.js 26 LTS, TypeScript 6.0 (don't upgrade to TS 7 until NestJS CLI and typescript-eslint support it).
- **api:** NestJS (Fastify adapter)
- **worker:** BullMQ on Redis
- **data:** PostgreSQL 17 + Drizzle ORM + RLS
- **auth:** Better Auth (cookie sessions, organization = tenant)
- **real-time:** Socket.IO
- **contracts:** Zod schemas in `packages/shared`
- **AI:** Vercel AI SDK with the OpenRouter / OpenAI provider
- **web:** React + Vite + Tailwind + shadcn/ui + Motion
- **testing:** Vitest + Testcontainers + Playwright
- **deploy:** Docker Compose + Caddy on Ubuntu

## Rules
- **Package manager is pnpm.** TypeScript stays `strict`. Avoid `any`, and validate unknown data with Zod.
- **`packages/shared` Zod schemas are the single source of truth** for data shapes (API contracts, JSONB columns, webhook payloads, LLM output).
- **Tenant isolation:** every tenant table has `tenant_id` + an RLS policy. All tenant queries go through `withTenant()` from `packages/db`. Add a cross-tenant denial test for every new tenant table.
- **Secrets** never go in git or chat. Use `.env` (keep `.env.example` updated). Per-tenant Meta tokens are AES-256-GCM encrypted at rest.
- **Meta webhooks:** verify the signature on the raw body, persist raw, enqueue, return 200 fast. Processing is idempotent (unique `wa_message_id`, `leadgen_id`).
- **24 h window:** free-form messages only inside the window, templates outside it.
- **Domain and URLs** come from config, never hardcoded (white-label later).
- **AI model per task and LLM provider** come from config. Don't hardcode model IDs in engine code.
- **Dependencies:** keep them minimal, and justify any new one.
- **Decisions:** when a decision changes, append a new entry to docs/DECISIONS.md. Don't edit old entries.

## Working agreement
- The owner communicates in Hinglish. Reply in Hinglish (technical terms in English).
- In discussions, ask questions **one at a time**.
- Work milestone by milestone. Each milestone ends with a demo the owner can test.
- Pricing is deferred. Model choice is decided by the M3 eval.

## Status
- 2026-11-17: discovery complete, docs written.
- 2026-11-17: LLM provider switched to OpenAI / OpenRouter (D-021). Backend switched from .NET to full-stack TypeScript (D-022 to D-027).
- 2026-11-17: **M0 built and verified locally.** Node 26.13.1 + pnpm 12.21.0 installed. Dev infra runs on host ports Postgres 5434, Redis 6380, Seq 5380 (another local project uses 5433/6379). First commit created on `main` (push to GitHub done by the owner). Next: M1.

## Local dev notes
- Run commands with Node 26 (`nvm use 26.13.1`). In tool shells, prepend `C:\nvm4w\nodejs` to PATH.
- `pnpm infra:up` then `pnpm dev`. Web: http://localhost:5173, API: http://localhost:3000/api/health, Seq: http://localhost:5380.
- The owner's other Docker containers (e.g. `personal-assistant-*`) are separate projects. Stop or change them only when the owner asks. They were stopped on request on 2026-11-17 (restart policy `unless-stopped`, so they stay stopped).
