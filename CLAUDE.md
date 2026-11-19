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
- **real-time:** Server-Sent Events fed by Postgres LISTEN/NOTIFY (D-079)
- **contracts:** Zod schemas in `packages/shared`
- **AI:** Vercel AI SDK with the OpenAI provider (OpenRouter optional)
- **web:** React + Vite + Tailwind + shadcn/ui + Motion
- **testing:** Vitest + Testcontainers + Playwright
- **deploy:** Docker Compose + Caddy on Ubuntu

## Rules
- **Generic product (D-061):** the engine, defaults, prompts, examples and UI copy must fit any business. Industry knowledge (questions, scoring rules, wording) goes only in `packages/core/src/templates/*`. Travel is just the first client's template.
- **Package manager is pnpm.** TypeScript stays `strict`. Avoid `any`, and validate unknown data with Zod.
- **`packages/shared` Zod schemas are the single source of truth** for data shapes (API contracts, JSONB columns, webhook payloads, LLM output).
- **Tenant isolation:** every tenant table has `tenant_id` + an RLS policy (`ENABLE` + `FORCE` + `tenant_isolation` policy, in a custom migration). All tenant queries go through `withTenant()` from `packages/db`. Add a cross-tenant denial test to `packages/db/src/rls.test.ts` for every new tenant table.
- **DB connections:** `APP_DATABASE_URL` (`qualify_app`) for api/worker, `DATABASE_URL` (owner) only for `pnpm db:migrate`. Apps import drizzle operators (`eq`, `and`, `sql`…) from `@qualify/db`, never from `drizzle-orm` directly.
- **Schema changes:** edit `packages/db/src/schema/*`, then `pnpm --filter @qualify/db db:generate`, then `pnpm db:migrate`. Better Auth tables are generated: `pnpm --filter @qualify/api auth:schema`.
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
- 2026-11-17: **M0 built and verified locally.** Node 26.13.1 + pnpm 12.21.0 installed. Dev infra runs on host ports Postgres 5434, Redis 6380, Seq 5380 (another local project uses 5433/6379). First commit created on `main` (push to GitHub done by the owner).
- 2026-11-17: **M1 built and verified** (auth, workspaces, RLS, protected app shell; e2e passes).
- 2026-11-17: **M2 done and live-verified** (real WhatsApp messages → inbox → dev reply → read receipts). The owner's own workspace "Appsdemo" (with the connected number and real messages) exists in the dev DB, so don't delete it. Next: M3 (AI agent) with OpenAI (D-039). Needs `OPENAI_API_KEY` in `.env`.
- 2026-11-18: **M3 done and live-verified.** The AI agent (gpt-5.4-mini, low; D-040) qualifies leads on WhatsApp. The travel playbook is installed in "Appsdemo". Next: M4 (lead forms, CTWA routing, opening templates, follow-ups, hybrid scoring).
- 2026-11-18: **M4 started.** Built early: inbound lead API `POST /api/v1/leads` + API keys, opening message (contact job, template outside 24 h), questions with options vs plain (buttons/list from `askingField`), playbook API `GET/PUT /api/v1/playbook` (D-044 to D-048). Postman: [docs/api/](docs/api/README.md). Dashboard: AI agent page, Add lead, Settings → API keys (D-049 to D-051). The opening template `qualify_opening_f65bb9d1` is approved and active in "Appsdemo" (template names are derived from the text, D-050). API docs page at /api-docs (D-054). Dashboard shows real data only (D-055). Scoring is configurable (D-060; `pnpm --filter @qualify/worker rescore-leads [slug]` recomputes scores). Follow-ups are configurable (D-059; follow-up template not yet approved in "Appsdemo"). Costs page: Meta's own billed amounts + AI estimate (D-058); update `AI_PRICES` in `packages/core/src/ai-pricing.ts` when OpenAI prices change. The approved opening template was live-verified on 2026-11-18 (API lead → template delivered). The owner's `.env` has `DEV_ALLOWED_NUMBERS=*` (D-057): every lead gets real WhatsApp messages in dev, so never create leads with made-up numbers in the "Appsdemo" workspace (scratch workspaces without a number are safe). Next: lead forms, CTWA routing, follow-ups, hybrid scoring.
- 2026-11-18: **Meta leads page and keyset pagination** (D-063, D-064). Growing lists use cursor pagination on (timestamp, id) with ascending composite indexes read backwards (never drizzle `.desc()` for keyset indexes); check new list queries with EXPLAIN. Rescoring after publish is the `lead-rescore` background job.
- 2026-11-18: **M4 features complete** (D-065 to D-068): lead attribution (CTWA referral, form, API campaign) with ad context for the agent, undeliverable detection (131026, only for leads who never wrote to us), form mapping editor on the Meta leads page. Routing rules moved to M5. M4 closes after the follow-up template is approved and the acceptance test passes.
- 2026-11-18: **M5–M8 work (D-069 to D-081):** leads list + Excel export, outbound webhooks (signed, retries, log), outcome API, Coexistence echoes pause the AI, mobile nav, production images/compose/Caddy/backups/release workflow (docs/DEPLOY.md, verified locally), test chat on the draft, version history, platform admin (`PLATFORM_ADMIN_EMAILS`), live updates (SSE + LISTEN/NOTIFY), number health + 131042 alert, Embedded Signup v4 (needs `META_ES_CONFIG_ID` + Tech Provider access). Since then: templates page with media headers (D-083/D-084), lead delete (D-085), multiple agents routed by form/ad/campaign (D-086; resolve with `resolvePlaybookForAttribution`, never assume the default playbook for a lead), AI agents overview with cards, where a card opens `/agent?agent=<id>` (D-087). e2e runs two specs at a time (`workers: 2`).
- 2026-11-19: **Scheduled e-mail reports** (D-088): Integrations → Email reports. Postgres owns the schedule (`next_run_at`, minute `report-tick`), SMTP via `SMTP_URL`/`MAIL_FROM`; dev mail goes to Mailpit. The agent confirms answers that came with the lead (form/API) before relying on them: per-agent mode + per-question switch, `leads.unconfirmed_fields` (D-089). Open: history import for Coexistence, `account_update` handling, PDF/Word knowledge base, bulk delete, CI e2e, month-end cost projection.
- 2026-11-19: **Activity log** (D-091): conversation → Activity panel, sidebar → Logs (`/logs`), `activity_log` table written by worker and api through `recordActivity` (never throws; add an entry when you add a new step that can fail or be skipped). Logs shows whether Meta reaches the webhook (`phone_numbers.last_event_at`). A yes confirms only answers the agent asked about (D-090).
- 2026-11-19: **Support access** (D-092): `/admin` → **Open read-only** (reason, 60 min) moves the platform admin's session into a client's workspace; `WorkspaceGuard` allows only reads (`WorkspaceContext.support`), exports are refused, every visit is in `support_sessions` + `audit_logs` and in the client's Logs. In the web, use `canManage(workspace)` / `canAct(workspace)` for controls that change things and `seesManagerViews(workspace)` for manager-only pages.
- 2026-11-19: **Production is live at https://qualify.appsdemo.in** (D-093) on the shared GCP VM that also runs `appsdemo-dine`: stack in `/opt/qualify/deploy/prod` (`compose.behind-proxy.yaml`, images `qualify/*:<git sha>` built locally and loaded over SSH), reached through dine's Caddy over the `qualify-edge` network (DEPLOY.md §3b). Never restart or edit dine's containers beyond that. Daily backup via `/etc/cron.d/qualify-backup`. Platform admin in prod: `admin@appsdemo.in` (password only in the owner's local private folder). Still open: SMTP empty in prod, the Meta webhook still points to the dev tunnel, dine's repo needs the same two Caddy/compose changes. Access details are in local memory, not in git.

## Local dev notes
- Run commands with Node 26 (`nvm use 26.13.1`). In tool shells, prepend `C:\nvm4w\nodejs` to PATH.
- The owner's machine has a **stale global `OPENAI_API_KEY`** environment variable. In development the api/worker loaders make `.env` override machine variables (`load-dotenv.ts` / `load-env.ts`). In ad-hoc scripts, read the key from `.env` directly; `process.loadEnvFile` and `--env-file` do NOT override existing variables.
- Don't run `pnpm build` while `pnpm dev` is running: it rewrites `apps/api/dist` and the Nest watcher exits (MODULE_NOT_FOUND). Restart `pnpm dev` if it happens.
- `pnpm infra:up`, then `pnpm db:migrate`, then `pnpm dev`. Web: http://localhost:5173, API: http://localhost:3000/api/health, Seq: http://localhost:5380, Mailpit (every e-mail the app sends in dev): http://localhost:8025.
- E2E: `pnpm --filter @qualify/web test:e2e`, with the dev stack running (uses the installed Chrome). `support.spec.ts` is skipped unless `E2E_PLATFORM_ADMIN_EMAIL` is set to an address in the api's `PLATFORM_ADMIN_EMAILS` (use a random one and remove it afterwards: the dev stack can be public through the tunnel). Check the result before committing; Nest DI errors only show at runtime (typecheck passes), so run e2e after api changes.
- Playwright's `getByLabel('Password')` also matches the "Show password" button, so use `{ exact: true }`.
- Drizzle gotcha: in single-table selects `${table.column}` renders as a bare `"column"`. In correlated subqueries, reference the outer table explicitly in raw SQL (e.g. `m.lead_id = leads.id`).
- Webhook routing: `resolveTenantByPhoneNumberId()` from `@qualify/db`. Never query `phone_numbers` outside `withTenant()`.
- Lead forms are live-verified (2026-11-18): Page "AppsDemo Technologies" (110501945112193) is connected to "Appsdemo"; its token is `META_PAGES_TOKEN` (lacks `pages_manage_ads`, so form questions are read from the answer keys).
- Connect a Facebook Page (lead forms): `pnpm --filter @qualify/worker connect-dev-page [workspace-slug] [page-id-or-name]` (needs a token with pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval: `META_PAGES_TOKEN` or the system-user token). `set-dev-webhook` subscribes both WhatsApp messages and Page leadgen.
- Connect our dev number: `pnpm --filter @qualify/worker connect-dev-number [workspace-slug]`. It is connected to the owner's "Appsdemo" workspace. Meta app = **appsdemo_api** (App ID, secret and system-user token are all from it).
- Live webhooks in dev: run `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:5173`, then `pnpm --filter @qualify/worker set-dev-webhook https://<host>.trycloudflare.com`. The quick-tunnel URL changes on every restart.
- Agent eval: `pnpm --filter @qualify/worker eval -- --models gpt-5.4-mini` (~$0.5 per model; spends API credits, so ask first). Install the template in a workspace: `pnpm --filter @qualify/worker install-playbook [slug]`.
- API key for Postman: `pnpm --filter @qualify/worker create-api-key [slug] ["name"]` (printed once; the owner runs it so only they see the key). Opening template: `pnpm --filter @qualify/worker opening-template create|status [slug]` (`create` submits to Meta, so ask first). Templates: `install-playbook [slug] [--template=<key>] [--upgrade | --fill-missing]` (keys: general, travel-packages, real-estate, education, clinic).
- For a live API check, create a temporary key in a script, never print it, and revoke it afterwards.
- Clean test data only by exact criteria. The owner uses the dev DB too (their workspace "Appsdemo").
- The owner's other Docker containers (e.g. `personal-assistant-*`) are separate projects. Stop or change them only when the owner asks. They were stopped on request on 2026-11-17 (restart policy `unless-stopped`, so they stay stopped).
