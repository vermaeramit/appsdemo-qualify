# Milestones & Build Plan

**Build model:** the owner (decisions, Meta console work, testing, client coordination) + Claude Code (architecture, code, tests, infra, docs).

**Each milestone ends with a demo the owner can test.**

---

## Prerequisites (owner)

**Local machine (Windows 11)**
- [x] **Node.js 26.13.1 LTS** via nvm-windows (D-028)
- [x] pnpm 12.21.0 (installed globally with npm; Node 26 no longer bundles corepack)
- [x] Docker Desktop (WSL2 backend)
- [x] Git (logged in)
- [x] Private GitHub repo: https://github.com/vermaeramit/appsdemo-qualify
- (.NET SDK is no longer needed. See D-022.)

**Accounts & credentials** (store in local `.env`; never paste in chat, never commit)
- [ ] LLM API key: OpenRouter (recommended for the M3 model comparison) and/or OpenAI, with a monthly spend limit or credit cap
- [ ] Meta App ID and App Secret
- [ ] Test number Phone Number ID and WABA ID
- [ ] System User access token (for development)
- [ ] Domain DNS access for `appsdemo.in` (subdomains `qualify`, `qualify-staging`)

**Meta**
- [x] Business portfolio verified (AppsDemo, 14 Mar 2026)
- [x] WhatsApp account with production number + test number
- [ ] Confirm the app type is *Business* and it is linked to the AppsDemo portfolio
- [x] Product name final: **AppsDemo Qualify**. The Meta App carries the same name.
- [ ] Set a Primary Page on the portfolio
- [ ] Start Tech Provider onboarding + Access Verification
- [x] Privacy Policy, Terms and Data Deletion pages on appsdemo.in (owner confirmed)

**Travel client inputs** (not blocking: everything is configurable in the playbook UI. Development and evals use realistic sample travel data until the real inputs arrive.)
- [ ] Package list with "starting from" prices (domestic + international)
- [ ] FAQs and policies (cancellation, payment, inclusions)
- [ ] Current lead form fields
- [ ] What they consider a Hot / Warm / Cold lead
- [ ] Preferred tone and languages

---

## M0 — Foundation (Week 1) ✅ built 2026-11-17
- pnpm monorepo: `apps/api` (NestJS + Fastify, `/api/health`), `apps/worker` (placeholder process), `apps/web`, `packages/shared` (Zod contracts). `packages/db`, `core` and `integrations` are created in M1–M3 when first needed.
- Strict TypeScript config, ESLint + Prettier, `.gitignore`, `.editorconfig`, `.env.example`
- Docker Compose for dev: Postgres, Redis, Seq
- CI: format check + lint + typecheck + test + build + audit on push, Dependabot
- Web app: Vite + React + Tailwind + shadcn/ui (Nova preset, Geist font), indigo brand tokens, grade colours, light/dark theme, shimmer skeletons, Motion animations, a live API status pill, and a dashboard design preview with sample data

**Acceptance:** `pnpm infra:up` + `pnpm dev` start everything ✅ (verified locally). CI is green on push (pending the first push).

**Follow-ups noted:** web bundle is ~616 KB. Route-level code-splitting comes in M1 together with routing.

## M1 — Multi-tenant core
- NestJS api on the Fastify adapter, health endpoint, Pino logging, helmet, rate limiting
- Drizzle schema + migrations: partners, tenants, audit_logs + Better Auth tables
- RLS policies + `withTenant()` helper + cross-tenant denial tests (Testcontainers)
- Better Auth: sign up, log in, cookie session, organization = workspace (tenant)
- React app shell: login, layout, sidebar, empty dashboard, skeleton loaders, command palette shell

**Acceptance:** sign up → create workspace → log in → see the dashboard shell. RLS tests pass.

## M2 — WhatsApp core
- `/webhooks/meta`: verify token + raw-body signature, persist raw, enqueue (BullMQ)
- Worker: send and receive text messages and interactive messages through the Cloud API
- Message storage, idempotency, delivery status updates
- Embedded Signup flow (tested on our own portfolio)
- Local tunnel setup documented

**Acceptance:** message the test number → it is stored and visible in the DB/UI → an echo reply arrives on WhatsApp.

## M3 — AI agent
- LLM client: Vercel AI SDK with the OpenRouter / OpenAI provider from config, cache-friendly prompt builder, structured output from Zod schemas
- Hybrid playbook engine: fields, rules, KB-in-prompt, language detection, buttons and lists
- Debounce (BullMQ deduplication) + per-lead Redis lock, 24 h window logic, human-takeover pause
- Travel – Domestic and Travel – International playbook templates (seeded)
- **AI eval harness** with 50–100 travel scenarios. Run it on a shortlist of models through OpenRouter, then **choose the model per task** (record it as a new decision)

**Acceptance:** a full natural qualifying chat with the travel agent on the test number. The eval report is reviewed and the model is chosen.

## M4 — Leads & scoring
- Page connect + `leadgen` webhook + lead fetch + field mapping (tested with the Lead Ads Testing Tool)
- CTWA referral capture + routing rules
- Opening templates + follow-up sequence (BullMQ delayed jobs)
- Hybrid scoring engine, final score, reason, summary, status machine
- Undeliverable detection

**Acceptance:** a test form lead → template within 60 s → reply → chat → score + reason. A lead that doesn't reply → follow-ups → `unresponsive`.

## M5 — Dashboard UI
- Leads list (TanStack Table, filters, badges), lead detail (live chat over Socket.IO, fields, animated score gauge, breakdown)
- Playbook builder (drag-and-drop fields, persona, rules, KB upload, draft/publish/versions) + test chat simulator
- Scoring builder with "test on sample chat"
- KPI dashboard (animated counters, charts)
- Playwright tests for the critical flows

**Acceptance:** the whole product can be operated from the UI without touching the DB.

## 📹 App Review checkpoint (around the end of M5)
- Record screencasts for each permission (onboarding, messaging, templates, lead retrieval)
- Submit the Meta App Review. Build continues while it is pending.

## M6 — Templates, Coexistence & health
- Template manager: create, submit, status sync, multi-language versions, travel template library
- Coexistence onboarding path + echo handling + history sync handling
- Business profile editor
- Number health: quality rating, token validity, 14-day app-activity alerts

**Acceptance:** create a template in the UI → it shows Meta's approval status. Health page shows live status.

## M7 — Outputs & admin
- Excel export (ExcelJS, filters, column picker), scheduled email reports (BullMQ repeatable jobs)
- Webhook endpoints: events, conditions, mapping, auth, signing, retries, delivery logs, resend, test payload
- Inbound API (`/api/v1/leads`, `/outcome`) + API keys
- Super Admin panel: tenants, usage, health, audited impersonation, Bull Board

**Acceptance:** a qualified lead arrives at webhook.site with a valid signature, and the Excel export matches the UI.

## M8 — Production & pilot
- Provision the VPS, harden it, deploy with Docker Compose + Caddy at `qualify.appsdemo.in` (+ staging)
- Backups + restore drill, Uptime Kuma alerts, Seq logs
- Final AI eval run on the travel client's real playbook
- Onboard the travel client (after App Review approval). Pilot one campaign for a week, then go fully live.

**Acceptance:** the travel client's live leads are qualified end to end in production, and the pilot metrics are collected for the case study.

---

## After MVP
- **Phase 2 (months 3–4):** agency panel, Conversions API feedback, outcome calibration, billing (Razorpay), voice notes, Google Sheets sync, cost-per-qualified-lead analytics
- **Phase 3 (months 5–6+):** white-label (custom domains, branding), more industry templates, native CRM integrations, pgvector KB, AI voice-call add-on, Meta Solution Partner
