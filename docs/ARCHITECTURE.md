# AppsDemo Qualify — Architecture

**Status:** Draft v2 (full-stack TypeScript) · **Date:** 2026-11-17

Related: [PRD.md](PRD.md) · [DECISIONS.md](DECISIONS.md) · [MILESTONES.md](MILESTONES.md)

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Runtime / language | Node.js 26 LTS (`.nvmrc`), TypeScript 6.0 (strict; TS 7 not yet supported by NestJS CLI / typescript-eslint) |
| Monorepo | pnpm 12 workspaces (version pinned via `packageManager`) |
| API | NestJS with the Fastify adapter |
| Worker | Separate Node process running BullMQ processors (a NestJS application context that shares the same modules) |
| Database | PostgreSQL 17 (JSONB, Row-Level Security; pgvector later) |
| Data access | Drizzle ORM (SQL-like, type-safe). Raw SQL through Drizzle's `sql` for heavy reports. |
| Migrations | drizzle-kit generated SQL (committed to git) + hand-written SQL for RLS policies |
| Jobs / scheduling | BullMQ on Redis: delayed, deduplicated (debounce), retried and repeatable jobs. Bull Board for job monitoring. |
| Redis | Queues, per-lead locks, per-number rate limiting, cache, Socket.IO adapter |
| Real-time | Socket.IO |
| Validation / contracts | Zod schemas in `packages/shared`, used by api, worker and web |
| Auth | Better Auth: cookie sessions, organization plugin (organization = tenant), CSRF protection |
| AI | Vercel AI SDK with the OpenRouter provider or the OpenAI provider. Structured output from Zod schemas. Model per task from config. |
| Frontend | React + Vite + TypeScript, TanStack Router (file-based, auto code-splitting), Tailwind CSS, shadcn/ui, Motion, TanStack Query, TanStack Table, React Hook Form + Zod, dnd-kit, Recharts, Lucide, Sonner, socket.io-client, Better Auth React client |
| Excel / email | ExcelJS (streaming writer) / Nodemailer + transactional provider (TBD) |
| Logs / monitoring | Pino → Seq, Uptime Kuma |
| Testing | Vitest, Testcontainers (Postgres, Redis), Playwright (UI end-to-end) |
| Security tooling | `@fastify/helmet`, `@fastify/rate-limit`, Zod at every boundary, Dependabot + `pnpm audit` in CI, pinned lockfile |
| Deployment | Ubuntu 24.04 LTS, Docker Compose, Caddy (automatic TLS), GitHub Actions → GHCR → SSH deploy |

## 2. System overview

```
             Meta (WhatsApp Cloud API, Graph API: lead forms, pages)
                    │ webhooks (HTTPS, X-Hub-Signature-256)        ▲ send messages / templates
                    ▼                                               │
┌────────────────────────── qualify.appsdemo.in (Caddy) ────────────┼──────────────┐
│  /               → web: React static build                        │              │
│  /api/*          → api: NestJS (dashboard APIs, auth, inbound lead API)          │
│  /socket.io/*    → api: Socket.IO gateway (live chat, live scores)│              │
│  /webhooks/meta  → api: verify signature → persist raw → enqueue → 200           │
└──────────────────────────┬────────────────────────────────────────┼──────────────┘
                           │ BullMQ jobs (Redis)                    │
                           ▼                                        │
                  worker ───────────────────────────────────────────┘
                  · lead ingestion      · conversation engine (LLM)
                  · scoring             · follow-up timers
                  · outbound webhooks   · scheduled reports · health checks
                           │
              PostgreSQL (RLS) · Redis · local file volume
```

## 3. Repository structure

```
/                                  repo root (appsdemo-qualify)
├── CLAUDE.md
├── docs/                          PRD, architecture, decisions, milestones
├── apps/
│   ├── api/                       NestJS (Fastify): REST, auth, Meta webhooks, Socket.IO gateway
│   ├── worker/                    BullMQ processors: ingestion, conversation, scoring,
│   │                              follow-ups, outbound webhooks, reports, health
│   └── web/                       React + Vite dashboard
├── packages/
│   ├── shared/                    Zod schemas + TS types (lead, playbook, events, API contracts)
│   ├── db/                        Drizzle schema, migrations, RLS SQL, withTenant() helper
│   ├── core/                      Pure domain logic, no I/O (scoring rules, window logic,
│   │                              routing, phone/field normalization)
│   └── integrations/              Meta Graph/Cloud API client, LLM client, crypto
├── tests/ai-evals/                Scenario conversations + graders
├── deploy/                        docker-compose.yml, Caddyfile, backup scripts
└── .github/workflows/
```

- Unit and integration tests live next to the code they test (`*.test.ts`).
- **Modular monolith:** two backend deployables (api, worker) share the `packages/*` code. No microservices in Phase 1.
- **`packages/shared` is the single source of truth** for data shapes. Changing a schema there breaks the build wherever a caller hasn't been updated.

## 4. Multi-tenancy

### 4.1 Hierarchy
```
Platform
 └── Partner        (Default | Agency | Reseller; branding + custom domain later)
      └── Tenant    (a business, e.g. the travel company) = Better Auth organization
           ├── WhatsApp accounts & numbers, Pages, Playbooks, Templates, Leads
           └── Users via organization members (Owner | Manager | Viewer)
```

### 4.2 Isolation
- Every tenant-owned table has `tenant_id` and an RLS policy:
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- The app connects as a **non-owner role**, and RLS uses `FORCE ROW LEVEL SECURITY`, so the table owner can't bypass it by accident.
  - `APP_DATABASE_URL` → `qualify_app` (api, worker). `DATABASE_URL` → owner (migrations only).
  - Migration `0001_rls_and_app_role` creates the role if missing (NOLOGIN), grants DML plus default privileges, makes `partners` read-only, and enables the policies. In production, create `qualify_app` WITH LOGIN before migrating. In dev, `deploy/dev/postgres-init.sql` does it.
- **All tenant queries go through `withTenant(tenantId, async (tx) => …)`** from `packages/db`. It opens a transaction and runs `select set_config('app.tenant_id', $1, true)` before anything else.
  - API: the tenant comes from the active organization in the Better Auth session.
  - Worker: the tenant comes from the job payload.
- Platform-level operations (Super Admin, webhook routing lookups) use a separate, narrowly scoped DB role and module.

### 4.3 Tenant resolution for Meta webhooks
- All Meta webhooks hit one endpoint, `/webhooks/meta`, because there is one app-level subscription.
- WhatsApp events resolve the tenant by `metadata.phone_number_id` (or `waba_id`).
- Lead-form events resolve it by `page_id`.

### 4.4 Secrets
- Per-tenant Meta tokens and webhook auth secrets are stored **AES-256-GCM encrypted** (Node `crypto`).
- The master key lives only in the server environment, never in git or the database.

## 5. Data model (key tables)

| Table | Key columns |
|---|---|
| Better Auth tables | `user`, `session`, `account`, `organization`, `member`, `invitation` (managed by Better Auth) |
| `partners` | id, name, type, branding (jsonb), custom_domain |
| `tenants` | id (= organization id), partner_id, status, default_language, allowed_languages, timezone, settings (jsonb) |
| `whatsapp_accounts` | tenant_id, waba_id, business_id, onboarding_type (coexistence / cloud), access_token_enc, status |
| `phone_numbers` | tenant_id, whatsapp_account_id, phone_number_id, display_phone, display_name, quality_rating, is_coexistence, last_app_activity_at, health_status |
| `meta_pages` | tenant_id, page_id, name, page_token_enc, subscribed |
| `lead_sources` | tenant_id, type (meta_form / ctwa / api), external_ref (form_id / ad_id / campaign), playbook_id, field_mapping (jsonb) |
| `playbooks`, `playbook_versions` | version: playbook_id, version_no, config (jsonb: persona, fields, rules, kb refs, follow-ups, closing, handoff), scoring (jsonb), status (draft / published), published_at |
| `knowledge_documents` | tenant_id, playbook_id, file_path, extracted_text, token_count |
| `message_templates` | tenant_id, whatsapp_account_id, name, language, category, components (jsonb), status, meta_template_id |
| `leads` | tenant_id, phone_e164 (unique per tenant), name, source, source_ref, playbook_version_id, status, language, fields (jsonb), score, grade, score_breakdown (jsonb), summary, ai_paused, window_expires_at, followups_sent, qualified_at, outcome, outcome_value |
| `messages` | tenant_id, lead_id, direction, sender (lead / ai / human_app / system), type, body, wa_message_id (unique), status, template_name, created_at (partition by month later) |
| `lead_events` | tenant_id, lead_id, type, payload (jsonb), created_at (timeline) |
| `webhook_endpoints` | tenant_id, url, auth_enc, signing_secret_enc, events[], conditions (jsonb), field_mapping (jsonb), active |
| `webhook_deliveries` | endpoint_id, event_id, payload, attempt, status_code, response_excerpt, next_retry_at |
| `inbound_meta_events` | raw payload, signature_ok, received_at, processed_at (audit + replay) |
| `api_keys` | tenant_id, prefix, key_hash, scopes, last_used_at |
| `scheduled_reports` | tenant_id, cron, recipients, filters (jsonb) |
| `usage_records` | tenant_id, period, ai_leads, llm tokens (in / out / cached), est_cost |
| `audit_logs` | actor, tenant_id, action, target, at |

JSONB columns (`fields`, `config`, `scoring`, …) are typed with Zod schemas from `packages/shared` and validated on read and on write.

### Lead status machine
```
new ──► contacting ──► engaged ──► qualified
          │  (template)   │ (lead replied)  ├──► disqualified
          │               │                 └──► unresponsive (no reply after follow-ups / 24 h)
          └──► undeliverable (not on WhatsApp)
any active state ──► handoff (human replied or lead asked for a human; ai_paused = true)
```

## 6. Meta integration

### 6.1 Onboarding (Embedded Signup)
- Uses Facebook Login for Business with an Embedded Signup configuration, with Coexistence as the default path.
- After signup:
  1. Exchange the code for a business token.
  2. Capture the WABA ID and phone number ID from the session info.
  3. Subscribe our app to the WABA webhooks (`/{waba-id}/subscribed_apps`).
  4. Register the number (Cloud API path) or run the Coexistence sync steps (contacts / history).
- The client's WABA and number **stay in the client's own Business portfolio**. Our app only gets access.
- Meta bills message charges to the client's payment method directly.

### 6.2 Inbound webhooks
- Verify `X-Hub-Signature-256` against the **raw request body** with the app secret. Fastify must keep the raw body for this route.
- Persist the raw payload to `inbound_meta_events`, enqueue a BullMQ job, and return 200 immediately.
- Idempotency: unique `wa_message_id`. Lead-form events are deduped on `leadgen_id`.
- Coexistence echoes (messages sent from the phone app) are stored with `sender = human_app` and trigger the AI pause.

### 6.3 Lead forms
- Subscribe each Page to `leadgen`.
- On each event, fetch the lead from the Graph API using `leadgen_id` and the page token.
- Map form answers to playbook fields with `lead_sources.field_mapping`.

### 6.4 Click-to-WhatsApp
- The first inbound message carries `referral` (`source_id` = ad ID, headline, `ctwa_clid`). It drives playbook routing and gives the agent its opening context.

### 6.5 Messaging rules
- **24 h customer-service window:** opens or refreshes only when the *lead* messages us. Outside it, only templates may be sent.
- **CTWA:** 72 h free entry-point window.
- **Per-number throughput:** Coexistence 20 msg/s, Cloud API 80 msg/s. Enforced with a Redis token bucket per `phone_number_id`.
- **"Not on WhatsApp"** is detected from the delivery-failure status webhook (undeliverable error). The Cloud API has no pre-send contact check. Per-message pricing charges only delivered messages; verify against the current Meta pricing docs.

### 6.6 App review permissions (confirm the final list during M5)
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management` (if Embedded Signup requires it)
- `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, plus the ads permissions needed for lead access
- Conversions API permissions in Phase 2

## 7. Conversation engine

### 7.1 Pipeline (per inbound lead message)
```
Inbound message
  → store (idempotent on wa_message_id)
  → if echo from phone app → ai_paused = true, stop
  → if ai_paused / terminal status → stop
  → debounce: add BullMQ "respond" job for this lead with ~4 s delay and per-lead
    deduplication (debounce mode), so a burst of messages produces one reply
Respond job
  → acquire Redis lock lead:{id}
  → load lead state + published playbook version + recent messages (withTenant)
  → call LLM (structured output, Zod schema)
  → guardrail checks on reply (no price commitment, length, language)
  → send via Cloud API (interactive buttons/list if field is a choice)
  → update fields, signals, live score, status; emit events (Socket.IO + outbound webhooks)
  → if completion criteria met → final scoring + summary → lead.qualified / disqualified
  → (re)schedule follow-up job; release lock
```

### 7.2 Prompt structure (cache-friendly)
1. **System prompt (stable, cached):** platform instructions + tenant persona + rules + field definitions + knowledge base. Rebuilt only when a playbook version is published.
2. **Conversation messages:** appended turn by turn.
3. **Per-turn state:** collected fields, missing required fields, window time left, follow-up count. It is appended as a system message after the latest lead message, so the stable prefix stays cacheable. OpenAI-style providers cache long prompt prefixes automatically.

### 7.3 Structured output (shape)
```json
{
  "language": "hinglish",
  "reply": { "text": "Wah, Dubai! 😊 Kab ka plan hai?", "buttons": ["Is mahine", "2-3 mahine", "Abhi decide nahi"] },
  "extracted_fields": { "destination": "Dubai", "travelers": 4 },
  "signals": { "urgency": 7, "seriousness": 6, "buying_signals": 5, "asked_price": true },
  "handoff": { "requested": false, "reason": null },
  "disqualify": { "matched": false, "rule": null }
}
```
- Defined as a Zod schema in `packages/shared` and requested through the AI SDK's structured-output support (JSON-schema mode on models that support it). On OpenRouter, route only to providers that support structured outputs.
- The SDK validates the output against the schema. On failure, retry once. If it fails again, send a safe holding reply and flag the lead.
- Check the finish reason (length, content filter) before using the output.

### 7.4 Follow-ups
- One BullMQ delayed job per lead and step, defined by the playbook (for example, +2 h, +1 day). The job ID is deterministic, so it can be removed.
- Removed when the lead replies.
- Outside the 24 h window, follow-ups use approved templates.

### 7.5 Non-text messages (Phase 1)
- Voice notes, images and stickers get a configured reply in the lead's language.
- A flag is set on the lead and counted in analytics.
- A location message can fill `departure_city`.

## 8. Scoring engine

- **Rule points:** deterministic, evaluated in `packages/core` from `fields` against the playbook's scoring config. Default max is 70.
- **AI intent:** default max 30.
  - Anchored 0–10 criteria (urgency, seriousness, buying signals), each with written level definitions, plus tenant guidance.
  - The anchors keep scores consistent from run to run.
- **Final score** = rules + AI. Grade comes from the configured thresholds. Disqualify rules override the grade.
- **Live score** is recomputed every turn.
- **Final score** is computed at completion, at handoff, or after 24 h of inactivity.
  - `lead.score_changed` fires only when the grade changes.
  - `lead.qualified` fires once.
- A **reason string** and a summary are stored for Excel and webhooks.

## 9. Outputs

- **Excel/CSV:** ExcelJS streaming writer, generated in the worker for large exports, with filters and a column picker.
- **Scheduled reports:** a BullMQ repeatable job (job scheduler per tenant report), sent as an email attachment.
- **Outbound webhooks:**
  - JSON payload with `event`, `event_id` (idempotency), `timestamp` and `lead`, typed by Zod
  - HMAC-SHA256 signature header
  - retries with exponential backoff (BullMQ, about 6 attempts)
  - every attempt logged in `webhook_deliveries`
  - manual resend and a test payload
- **Inbound API:** `POST /api/v1/leads` creates a lead from any source. `POST /api/v1/leads/{id}/outcome` records booked or lost, with a value.

## 10. AI model strategy & cost

- **Vercel AI SDK** with the OpenRouter provider (development and M3 eval) and the OpenAI provider (an option in production). Switching providers is a config change.
- **Per-task model configuration:** chat reply, field extraction, final scoring, summary.
  - Platform defaults live in config.
  - Per-tenant overrides are possible later.
- **The final model choice is made from the M3 eval, not assumed.**
  - The eval runs 50–100 travel scenarios.
  - It grades field accuracy, guardrail compliance, language mirroring, tone and cost per conversation.
  - Candidates: a shortlist of models across providers, compared through OpenRouter with one API key.
- **Production endpoint:** after M3, either keep OpenRouter (flexibility, provider fallbacks) or call the chosen provider directly (lower latency, no platform fee).
- **Data policy:** on OpenRouter, allow only providers that don't train on prompts (account privacy settings), because chats contain lead PII.
- **Prompt caching** on the stable system prefix. Verify it with the cached-tokens figure in the usage data.
- **Usage metering:** record tokens (input, output, cached) per lead in `usage_records` for billing and margin tracking.
- **Phase 1 knowledge base** goes into the cached prompt, with no vector DB. pgvector is added when a tenant's KB outgrows the prompt.

## 11. Security & compliance

- **Auth:** Better Auth cookie sessions (httpOnly, Secure, SameSite) with CSRF protection. This works because the SPA and API share one origin. Password hashing is built in. 2FA plugin later.
- **Input validation:** Zod at every boundary: API bodies and params, Meta webhook payloads, LLM output, JSONB reads.
- **HTTP hardening:** `@fastify/helmet` security headers, `@fastify/rate-limit` (stricter on auth and inbound API), body size limits.
- **Tenant isolation:** RLS (section 4.2), plus integration tests that try cross-tenant access.
- **Secrets:** encrypted at rest (section 4.4). `.env` is never committed.
- **Webhooks:** Meta signature verified on inbound (raw body); our signature on outbound.
- **Supply chain:** pinned `pnpm-lock.yaml`, minimal dependencies, Dependabot, `pnpm audit` in CI.
- **Audit log** for admin actions, impersonation and config publishes.
- **DPDP / privacy:**
  - consent captured from the lead form
  - per-tenant retention (auto-delete chats after N months)
  - lead data export and deletion
  - a data-deletion instructions page for Meta

## 12. Deployment & operations

- **Single VPS** for the MVP (4 vCPU / 8 GB), running Docker Compose: caddy (also serves the web static build), api, worker, postgres, redis, seq, uptime-kuma.
- **Network:** Postgres and Redis are reachable only on the internal Docker network.
- **Hardening:**
  - SSH keys only
  - ufw (80/443/SSH)
  - fail2ban
  - unattended security upgrades
- **Backups:**
  - daily `pg_dump` (later WAL archiving) plus file volume → off-site object storage
  - monthly restore drill
- **Environments:** `qualify-staging.appsdemo.in` and `qualify.appsdemo.in`.
- **Local dev:** Docker Desktop runs Postgres (host port 5434), Redis (6380) and Seq (UI on 5380) from `compose.yaml`. The ports avoid clashes with other local projects. The apps run with hot reload through `pnpm dev`. A Cloudflare Tunnel or ngrok receives Meta webhooks.
- **CI/CD:** on push to `main`: lint + typecheck + test → images to GHCR → deploy to staging. Production deploys are triggered manually.

## 13. Scaling path

| Stage | Trigger | Change |
|---|---|---|
| 1 | MVP → ~20 tenants | Single VPS |
| 2 | ~20–100 tenants | Database on its own server, or managed Postgres. Api and worker on separate servers. More worker replicas, because BullMQ distributes jobs across them. |
| 3 | 100+ tenants | 2+ api instances behind a load balancer with the Socket.IO Redis adapter, Redis on its own host, `messages` partitioning, a read replica for reports |

## 14. Testing strategy

- **Unit tests (Vitest):** scoring rules, routing, window logic, field and phone normalization, webhook signing, Zod schemas.
- **Integration tests (Vitest + Testcontainers):** Drizzle repositories under RLS (including cross-tenant denial tests), webhook ingestion, BullMQ job flows.
- **End-to-end UI tests (Playwright, `apps/web/e2e`):** critical flows such as sign-up, playbook publish, lead detail and webhook config. They run locally against the dev stack with the installed Chrome. A CI job comes later (D-032).
- **AI evals (`tests/ai-evals`):**
  - Scripted and simulated lead personas (an LLM plays the lead).
  - Graders check extracted fields, guardrails, language and handoff behaviour.
  - Run before every engine or prompt change and before go-live.
- **Meta end-to-end:** test number + Lead Ads Testing Tool.
