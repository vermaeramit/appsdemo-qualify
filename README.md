# AppsDemo Qualify

AI lead qualification on WhatsApp. Leads from Meta lead forms, Click-to-WhatsApp ads or the API are contacted from the business's own WhatsApp number, qualified in a natural conversation, scored, and delivered by Excel or webhook.

Product and technical docs live in [`docs/`](docs/). Start with [`CLAUDE.md`](CLAUDE.md) for a summary.

## Requirements

- Node.js **26.13.1** (see `.nvmrc`; with nvm-windows: `nvm install 26.13.1 && nvm use 26.13.1`)
- pnpm **12** (`npm install -g pnpm`; the exact version is pinned in `package.json` → `packageManager`)
- Docker Desktop

## Quick start

```bash
pnpm install
pnpm infra:up      # Postgres :5434, Redis :6380, Seq :5380 (local dev only)
pnpm dev           # api :3000, web :5173, worker, shared (watch)
```

Open http://localhost:5173. The header shows **API online** when the web app can reach the api through the Vite proxy.

| Service         | URL                              |
| --------------- | -------------------------------- |
| Web (dashboard) | http://localhost:5173            |
| API health      | http://localhost:3000/api/health |
| Seq (logs)      | http://localhost:5380            |

## Scripts

| Command                             | What it does                                                |
| ----------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                          | Builds `@qualify/shared`, then runs every app in watch mode |
| `pnpm build`                        | Production build of all packages                            |
| `pnpm typecheck`                    | TypeScript check across the workspace                       |
| `pnpm lint`                         | ESLint                                                      |
| `pnpm format` / `pnpm format:check` | Prettier                                                    |
| `pnpm test`                         | Vitest in every package                                     |
| `pnpm infra:up` / `pnpm infra:down` | Start / stop local Postgres, Redis and Seq                  |

## Repository layout

```
apps/api        NestJS (Fastify) API
apps/worker     Background worker (BullMQ processors from M2)
apps/web        React + Vite dashboard
packages/shared Zod schemas + types shared by all apps
docs/           PRD, architecture, decisions, milestones
```

`packages/db`, `packages/core` and `packages/integrations` are added in the milestones that need them (M1–M3).
