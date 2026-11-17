# AppsDemo Qualify

AI lead qualification on WhatsApp. Leads from Meta lead forms, Click-to-WhatsApp ads or the API are contacted from the business's own WhatsApp number, qualified in a natural conversation, scored, and delivered by Excel or webhook.

Product and technical docs live in [`docs/`](docs/). Start with [`CLAUDE.md`](CLAUDE.md) for a summary.

## Requirements

- Node.js **26.13.1** (see `.nvmrc`; with nvm-windows: `nvm install 26.13.1 && nvm use 26.13.1`)
- pnpm **12** (`npm install -g pnpm`; the exact version is pinned in `package.json` → `packageManager`)
- Docker Desktop
- Google Chrome (only for the end-to-end tests)

## Quick start

```bash
pnpm install
cp .env.example .env   # then set BETTER_AUTH_SECRET (command in the file)
pnpm infra:up          # Postgres :5434, Redis :6380, Seq :5380 (local dev only)
pnpm db:migrate        # create tables, the qualify_app role and RLS policies
pnpm dev               # api :3000, web :5173, worker, packages (watch)
```

Open http://localhost:5173, create an account and a workspace.

| Service         | URL                              |
| --------------- | -------------------------------- |
| Web (dashboard) | http://localhost:5173            |
| API health      | http://localhost:3000/api/health |
| Seq (logs)      | http://localhost:5380            |

## Scripts

| Command                                 | What it does                                                      |
| --------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                              | Builds the shared packages, then runs every app in watch mode     |
| `pnpm build`                            | Production build of all packages                                  |
| `pnpm typecheck`                        | TypeScript check across the workspace                             |
| `pnpm lint`                             | ESLint                                                            |
| `pnpm format` / `pnpm format:check`     | Prettier                                                          |
| `pnpm test`                             | Unit tests + RLS integration tests (Testcontainers, needs Docker) |
| `pnpm --filter @qualify/web test:e2e`   | Browser end-to-end tests (needs the dev stack running)            |
| `pnpm db:migrate`                       | Apply database migrations (as the database owner)                 |
| `pnpm --filter @qualify/db db:generate` | Generate a migration after a schema change                        |
| `pnpm infra:up` / `pnpm infra:down`     | Start / stop local Postgres, Redis and Seq                        |

## Repository layout

```
apps/api            NestJS (Fastify) API, Better Auth at /api/auth
apps/worker         Background worker (BullMQ processors from M2)
apps/web            React + Vite dashboard (TanStack Router)
packages/shared     Zod schemas + types shared by all apps
packages/db         Drizzle schema, migrations, RLS, withTenant()
docs/               PRD, architecture, decisions, milestones
```

`packages/core` and `packages/integrations` are added in M2–M3.
