# AppsDemo Qualify — Product Requirements Document

**Status:** Draft v1 · **Date:** 2026-11-17 · **Product URL:** qualify.appsdemo.in

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [DECISIONS.md](DECISIONS.md) · [MILESTONES.md](MILESTONES.md)

---

## 1. Summary

AppsDemo Qualify is a multi-tenant SaaS that qualifies inbound leads over WhatsApp with an AI agent.

When a lead arrives (Meta lead form, Click-to-WhatsApp ad, or API), the agent messages the lead **from the business's own WhatsApp number** within seconds. It runs a natural qualification conversation driven by a configurable playbook, scores the lead (rules + AI intent), and delivers the result to the business through **Excel export or webhook**.

It is a **qualification engine, not a CRM**. It plugs into whatever CRM or sheet the business already uses.

## 2. Problem

- Businesses running Meta ads get hundreds of leads a day. Most are junk or cold, or are never contacted in time.
- Sales teams spend the day calling unqualified leads while hot leads wait hours and go cold.
- Many leads arrive at night or on weekends, when nobody responds.
- Agencies running the ads keep hearing "your leads are junk", and they lose clients.

## 3. Customers

- **First customer:** a travel company selling domestic and international tour packages.
  - Leads come mainly from Meta, through both lead form ads and Click-to-WhatsApp ads.
  - Volume is about 200–300 leads/day.
  - They want output as Excel or webhook. They do not want a CRM.
- **The platform is industry-agnostic.** Industries are delivered as playbook templates: travel first, then real estate, education and insurance.
- **Buyer types by phase:**
  - Phase 1: direct businesses
  - Phase 2: agencies managing many clients
  - Phase 3: white-label resellers

## 4. Scope

| In scope | Out of scope (CRM territory) |
|---|---|
| Lead ingestion: Meta lead forms, Click-to-WhatsApp (CTWA) ads, inbound API | Assigning leads to sales reps |
| AI WhatsApp conversation + follow-ups | Pipelines, deal stages, tasks, reminders |
| Score, grade, reasons, summary | Calling, booking, payments |
| Outputs: Excel, scheduled email report, webhooks | Sales-team performance reporting |
| Read-only lead list + chat transcript | |
| Playbook, scoring and template configuration | |
| Analytics (lead quality, reply rate, per campaign) | |

## 5. Key user flows

### 5.1 Onboarding (target: live in 10–15 minutes)
1. Sign up and create a workspace (tenant).
2. **Connect WhatsApp** through Meta Embedded Signup.
   - Default is **Coexistence**: the business keeps using its WhatsApp Business App number on the phone.
   - Alternative is a full Cloud API number.
3. **Connect Facebook Page(s)** and select lead forms.
4. Pick a playbook template (for example, Travel – International) and customise it.
5. Map lead forms and ads to playbooks.
6. Test in the simulator, then go live.

### 5.2 Lead form lead
1. The lead submits the form. The `leadgen` webhook fires and we fetch the lead.
2. We normalize the phone number, dedupe, and route the lead to a playbook.
3. We send the **opening template within 60 s**.
4. The lead replies, which opens the 24 h window, and the AI conversation runs.
5. The lead is qualified and scored, and outputs fire.
6. If the lead never replies, the follow-up sequence of templates runs, and the lead ends as `unresponsive`.

### 5.3 Click-to-WhatsApp lead
1. The lead messages us. Meta includes the ad referral (`ad_id`, headline, `ctwa_clid`).
2. We route the lead to a playbook by ad or campaign.
3. The AI replies immediately (72 h free entry-point window).
4. Qualification, scoring and outputs run as in 5.2.

### 5.4 Human takeover
- A salesperson replies from the phone. Coexistence sends a message echo, and the AI pauses for that lead.
- Pause and resume are also available manually in the dashboard.

## 6. Functional requirements

### 6.1 Tenancy & accounts
- **FR-1.1** Hierarchy: Platform → Partner → Tenant → Users. Direct customers sit under a *Default* partner.
- **FR-1.2** Roles:
  - Tenant: Owner, Manager, Viewer
  - Partner Admin (Phase 2)
  - Super Admin (platform)
- **FR-1.3** Super Admin panel: tenants, usage, number health, and audited impersonation.

### 6.2 WhatsApp & Meta connection
- **FR-2.1** Embedded Signup with Coexistence (default) and full Cloud API options.
- **FR-2.2** Multiple numbers per tenant, limited by plan.
- **FR-2.3** Edit the business profile from the dashboard: about, description, logo, website, address. A display-name change needs Meta approval.
- **FR-2.4** Number health:
  - Quality rating and messaging limit
  - Token validity
  - **Coexistence 14-day app-activity alert**
- **FR-2.5** Connect Facebook Pages, list lead forms, and map form fields to playbook fields.

### 6.3 Lead ingestion
- **FR-3.1** Sources: Meta lead forms, CTWA, and an inbound REST API (API key per tenant).
- **FR-3.2** Normalize phone numbers to E.164. Dedupe per tenant on phone number. A repeat lead merges into the existing lead's timeline.
- **FR-3.3** Fields already answered in the form are pre-filled and never asked again.
- **FR-3.4** Numbers that turn out not to be on WhatsApp (delivery failure) are flagged and excluded from billing.

### 6.4 Playbooks (hybrid agent configuration)
- **FR-4.1** Persona: name, tone, message length, emoji use.
- **FR-4.2** Fields to collect. Each field has:
  - key and label
  - type: choice, range, date/month, yes-no, number, text
  - required or optional, and a priority
  - options (for choice fields)
  - per-field asking guidance
- **FR-4.3** Rules and guardrails, as free text plus structured settings (for example: never commit a final price or discount; at most N follow-ups).
- **FR-4.4** Disqualification rules, for example budget below a threshold or a destination that isn't served.
- **FR-4.5** Knowledge base: files (PDF/DOCX/TXT), URLs and FAQs. In Phase 1 it is injected into the cached prompt.
- **FR-4.6** Conversation lifecycle:
  - Opening template
  - Follow-up sequence (delays + templates)
  - Closing message
  - Post-qualification behaviour: stop, or answer FAQs only
- **FR-4.7** Handoff triggers: the lead asks for a call or a human, shows frustration, or asks something out of scope.
- **FR-4.8** Routing rules: form_id, ad_id or campaign → playbook.
- **FR-4.9** Draft and publish, version history, and rollback.
- **FR-4.10** Test chat simulator in the dashboard.
- **FR-4.11** Industry templates for Phase 1: *Travel – Domestic* and *Travel – International*.

### 6.5 Conversation engine
- **FR-5.1** Phase 1 is **text only**.
  - Voice notes, images and stickers get a configurable polite reply in the lead's language.
  - They are counted in analytics, which will decide the Phase 2 priority.
- **FR-5.2** Language auto-detect.
  - Hinglish (Roman script) and Hindi (Devanagari) are separate languages.
  - The agent mirrors the lead's script.
  - The tenant sets allowed languages and a default fallback.
- **FR-5.3** Stored data is always normalized to English (for example, "दुबई" → `Dubai`).
- **FR-5.4** Interactive messages: quick-reply buttons (≤3) for small choices, list messages (≤10) for larger ones.
- **FR-5.5** Debounce rapid messages from a lead and send one reply per burst.
- **FR-5.6** Enforce the 24 h customer-service window. Outside it, only templates are sent.
- **FR-5.7** Detect human takeover through Coexistence echoes, plus manual pause and resume.

### 6.6 Templates
- **FR-6.1** Create templates, submit them to Meta, and track status (approved / pending / rejected) from the dashboard.
- **FR-6.2** Multi-language versions of a template.
- **FR-6.3** A library of pre-built travel templates: opening, follow-ups, re-engagement.

### 6.7 Scoring
- **FR-7.1** Hybrid score = rule points + AI intent points.
  - Rule points: configurable, default max 70.
  - AI intent: default max 30, from anchored criteria (urgency, seriousness, buying signals) plus the tenant's own guidance.
- **FR-7.2** Configurable grade thresholds. Defaults: Hot ≥ 80, Warm 50–79, Cold < 50. Disqualified comes from rules.
- **FR-7.3** Live score after each turn. The final score is set when:
  - all required fields are collected, or
  - the lead asks for a call (handoff), or
  - there has been no reply for 24 h.
- **FR-7.4** Every score comes with a breakdown, a human-readable reason and a conversation summary.
- **FR-7.5** Outcome capture (booked / lost + value):
  - Phase 1: through the API
  - Phase 2: Excel upload and scoring-calibration insights

### 6.8 Outputs
- **FR-8.1** Excel/CSV export with filters (date, grade, score, source, playbook) and a column picker.
- **FR-8.2** Scheduled email reports, for example a daily Excel at 9 AM.
- **FR-8.3** Webhooks. Each endpoint supports:
  - multiple endpoints per tenant
  - an event selection
  - conditions (for example, `score >= 70 AND playbook = International`)
  - field mapping
  - auth: Bearer token, API-key header or Basic
  - an HMAC signature header
  - retries with backoff
  - delivery logs with a resend button
  - a "send test payload" button
- **FR-8.4** Events:
  - `lead.created`
  - `lead.engaged`
  - `lead.qualified`
  - `lead.disqualified`
  - `lead.score_changed` (on grade change only)
  - `lead.unresponsive`
  - `lead.handoff_requested`

### 6.9 Dashboard & analytics
- **FR-9.1** KPIs: leads today, qualified %, Hot count, median first-response time.
- **FR-9.2** Leads list with score and grade badges, filters, and export.
- **FR-9.3** Lead detail: live chat, extracted fields, score breakdown, webhook delivery status.
- **FR-9.4** Funnel per campaign or ad: leads → replied → qualified → Hot.

### 6.10 UI/UX
- **FR-10.1** Modern, professional SaaS look:
  - skeleton loaders
  - subtle micro-interactions (150–250 ms)
  - animated KPI counters and score gauge
  - live typing indicator
- **FR-10.2** Dark and light mode, a Ctrl+K command palette, responsive layout, and support for reduced motion.
- **FR-10.3** All colours, logo and fonts are theme tokens (CSS variables), so the UI is ready for white-labelling.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Speed to lead | Opening message ≤ 60 s after the lead form webhook (target p95 ≤ 15 s). AI reply ≤ ~10 s after the debounce window closes. |
| Throughput | Respect per-number Meta limits: Coexistence 20 msg/s, Cloud API 80 msg/s. |
| Reliability | No lead is lost. Processing is at-least-once and idempotent. Outbound webhooks retry. |
| Security | Tenant isolation through PostgreSQL RLS, encrypted secrets, signed webhooks, audit log. |
| Compliance | Meta policies (opt-in, template rules). DPDP Act: consent, data deletion, per-tenant retention, data export. |
| Scale (Phase 1) | ~20 tenants on one VPS. Validate with a load test before onboarding more. |

## 8. Roadmap

| Phase | Timing | Theme |
|---|---|---|
| Phase 0 | Week 1 | Foundation (Meta setup, infra, repo, design system) |
| Phase 1 | Weeks 1–8 (+ review) | MVP: travel client live |
| Phase 2 | Months 3–4 | Agency panel, Conversions API, outcome calibration, billing, voice notes, Google Sheets |
| Phase 3 | Months 5–6+ | White-label, more industry templates, native CRM integrations, pgvector KB, AI voice calls, Solution Partner |

Milestone detail: [MILESTONES.md](MILESTONES.md).

## 9. Success metrics

- Median first-response time: target < 1 minute (baseline: hours)
- Reply rate to the opening template
- Qualification completion rate
- Share of Hot leads that book (needs outcome data)
- Leads passed to sales per day vs. total leads (sales time saved)
- Client retention

## 10. Open decisions

| Topic | Notes |
|---|---|
| Pricing & plans | Deferred. Draft tiers by "AI Leads"/month were discussed, and margin depends on the model choice. |
| AI model per task | Decide after the M3 eval (chat, extraction, final scoring, summary). |
| Hosting provider | Hetzner (Singapore, cheapest) vs. an India region (Vultr / DigitalOcean / E2E). |
| Transactional email | For scheduled reports: Brevo / ZeptoMail / Amazon SES. |
| Travel client inputs | Packages, FAQs, scoring rules, lead form fields, template wording. |
| Branding | Logo and primary colour for AppsDemo Qualify. |

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Meta app review rejection or delay | Submit early (around M5) with clear screencasts. Keep the privacy, terms and data-deletion pages ready. |
| Coexistence disconnect (app not opened for 14 days) | Health monitor with proactive alerts to the tenant. |
| AI states wrong prices or makes promises | Hard guardrails in the prompt, a post-generation check, "starting from" prices only, and the eval set before go-live. |
| Template rejection | Pre-tested template library, category guidance, and status tracking. |
| AI cost erodes margin | Per-task model config, prompt caching, and an eval-driven model choice before pricing is fixed. |
| Junk or fake leads | Undeliverable detection, disqualification rules, no billing for invalid leads. |
| Single-server failure | Daily off-site backups with restore drills, uptime alerts, documented rebuild script. |
