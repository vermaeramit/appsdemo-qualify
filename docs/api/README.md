# AppsDemo Qualify — public API (v1)

Import [`AppsDemo-Qualify.postman_collection.json`](AppsDemo-Qualify.postman_collection.json) into Postman, then set the collection variables.

## Authentication

Every request needs a workspace API key:

```
Authorization: Bearer qk_live_…        (or)        X-API-Key: qk_live_…
```

Create a key (it is printed once; only its hash is stored):

```bash
pnpm --filter @qualify/worker create-api-key [workspace-slug] ["Key name"]
```

In development `baseUrl` is `http://localhost:5173/api` (or `https://<tunnel>/api`).

## POST /v1/leads — create a lead

Use it from a website form, a CRM, or Postman (Meta lead forms arrive the same way in M4).

```json
{
  "phone": "+91 98123 45678",
  "name": "Rahul Sharma",
  "source": "meta_form",
  "campaign": "Dubai December",
  "fields": { "destination": "Dubai", "travel_month": "2026-12" }
}
```

| Field | Rules |
|---|---|
| `phone` | Required, with country code (10–15 digits). Digits, spaces, `+`, `-`, `()` allowed. |
| `name` | Optional. Used in the opening ("Hi Rahul!"). |
| `source` | `api` (default) or `meta_form`. |
| `campaign` | Optional, stored in the audit log. |
| `fields` | Optional answers the lead already gave, keyed by the playbook question key. The agent never asks them again. Unknown keys and values that don't fit the question type are ignored and listed in `ignoredFields`. |

Response `202`:

```json
{ "leadId": "…", "isNewLead": true, "status": "queued", "ignoredFields": [] }
```

The same phone number is the same lead: new answers are merged into it.

**What happens next**
1. The worker sends the **opening message** from the workspace's WhatsApp number:
   - If the lead messaged in the last 24 hours, it sends free-form text with the opening buttons.
   - Otherwise WhatsApp only allows an **approved template**. The playbook's `opening.templateName` is used. Without an approved template, the attempt is shown as failed in Conversations.
2. When the lead replies, the AI agent continues and asks only what is still missing.
3. In development, only numbers in `DEV_ALLOWED_NUMBERS` receive messages (safety switch).
4. A second submission for the same lead within 10 minutes doesn't send another opening.

## GET /v1/playbook — read the agent configuration

Returns `{ playbookId, versionId, versionNo, config }`.

## PUT /v1/playbook — publish a new configuration

Send the full `config`. A new immutable version is published; running conversations keep the version they started with. Invalid configs get `400` with a list of issues.

### Questions: with options or plain

Each entry in `config.fields` is one question:

| `type` | Kind | How the lead answers |
|---|---|---|
| `choice` + `options` | With options | ≤3 options of ≤20 characters → reply **buttons**; 4–10 options → **list menu**. `allowOther: true` lets the lead type another answer. |
| `yes_no` | With options | **Yes/No buttons** in the lead's language (Haan/Nahi, हाँ/नहीं) |
| `text`, `number`, `range`, `date_month` | Plain | The lead types the answer (the AI may suggest up to 3 quick replies) |

Other keys per question: `key`, `label`, `required`, `priority` (lower is asked earlier), `question` (preferred wording; the agent keeps its meaning and translates it), and `guidance` (how to interpret and normalise answers).

Example:

```json
{ "key": "hotel_category", "label": "Hotel category", "type": "choice", "required": false,
  "priority": 9, "question": "Which hotel category do you prefer?",
  "options": ["3 star", "4 star", "5 star"] }
```

### Opening

```json
"opening": {
  "templateName": "qualify_opening_v1",
  "templateLanguage": "en",
  "bodyText": "Hi {{1}}! 👋 Thanks for your enquiry with {{2}}. …",
  "bodyParams": ["lead.firstName", "business.name"],
  "buttons": ["Yes, sure", "Not now"]
}
```

`bodyParams` sources: `lead.firstName`, `lead.name`, `business.name`, `field:<key>|fallback`, `text:<literal>`. `bodyText` must match the approved template exactly.

Submit and activate the template:

```bash
pnpm --filter @qualify/worker opening-template create   # submit to Meta for review
pnpm --filter @qualify/worker opening-template status   # when APPROVED, activates it in the playbook
```
