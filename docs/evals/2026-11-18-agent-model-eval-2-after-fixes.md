# Agent model eval — 2026-11-18

Playbook: travel template ("Sunrise Holidays", sample knowledge base). 12 scenarios (Hinglish, English, Hindi; discount seeking, call request, B2B, prompt injection, correction, all-in-one message). Simulated lead: `gpt-5.4-mini`. Judge: `gpt-5.5`. Max 9 agent turns. "Today" = 2026-11-18.

| Config | Outcome | Fields | Language | 1 question | No false promises | No repeats | No leak | Scenario notes | Tone | Turns to qualify | Median latency | Agent cost / conv. | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.4-mini | 100% | 96% | 83% | 100% | 100% | 83% | 100% | 92% | 4.8 | 3.1 | 3.0 s | $0.0044 | 0 |
| gpt-5.4-nano | 75% | 94% | 92% | 67% | 100% | 58% | 100% | 83% | 4.2 | 3.0 | 2.7 s | $0.0013 | 0 |

Columns: Outcome = expected end state (qualified / handoff / disqualified). Fields = deterministic checks of extracted values. Judge columns = share of conversations passing. Cost = agent calls only (USD), from published per-token prices.

## Findings per conversation
- **gpt-5.4-mini · english-bali-family** → qualified
  - fields: travelers: expected "2 adults, 2 children", got "4 travelers"
- **gpt-5.4-mini · hindi-kashmir-group** → qualified
  - judge: Agent asked to confirm departure city even though the lead had already said they were traveling from Lucknow.; Agent mixed English/Roman-script terms with Hindi instead of consistently mirroring the lead's Devanagari Hindi.
- **gpt-5.4-mini · hinglish-maldives-then-bali** → qualified
  - fields: destination: expected "Bali", got "Maldives"
  - judge: Agent repeated budget question after lead had already shared total budget as 90k / 80k-90k.; After lead asked for Bali options, agent did not clearly update destination to Bali; it asked whether Bali should be an alternate instead.
- **gpt-5.4-mini · hinglish-andaman-questions-first** → qualified
  - judge: Final agent message was in English, while the lead used Hinglish in Roman script.
- **gpt-5.4-nano · hinglish-dubai-couple** → qualified
  - judge: Agent asked two questions in one message: confirming Dec plan and asking budget.; Agent repeated the travel month question after the lead had already said Dec.
- **gpt-5.4-nano · english-bali-family** → qualified
  - judge: Agent repeated the departure city question after the lead had already said they were starting from Mumbai.
- **gpt-5.4-nano · hindi-kashmir-group** → handoff (wrong outcome)
  - fields: travelers: expected "4 adults", got "4 travelers"
- **gpt-5.4-nano · hinglish-goa-discount-seeker** → handoff (wrong outcome)
- **gpt-5.4-nano · english-wants-call** → handoff
  - fields: destination: expected "Thailand", got "—"
  - judge: Lead asked for a call; agent should have only agreed to handoff instead of adding a qualification question.
- **gpt-5.4-nano · b2b-travel-agent** → disqualified
  - judge: Asked for multiple pieces of information in one message: destination, travel month, and number of travelers.
- **gpt-5.4-nano · hinglish-europe-low-budget** → qualified
  - judge: First agent message asks two questions in one message: cities to cover and travel timing.
- **gpt-5.4-nano · english-kerala-short-answers** → qualified
  - judge: Agent used Hinglish/Roman Hindi while the lead language is expected to be English.
- **gpt-5.4-nano · hinglish-maldives-then-bali** → qualified
  - fields: destination: expected "Bali", got "Maldives"
  - judge: Agent asked whether the 90k budget was per person or total even though the lead had already said it was total.
- **gpt-5.4-nano · hinglish-singapore-all-in-one** → qualified
  - judge: Agent re-asked/asked to confirm details already provided: 2 adults, 1 child age 6, Bangalore, May, and ₹1.5 lakh budget.; Agent asks more than one thing in the same message: asks to confirm/share budget and asks if ₹1.5 lakh total is okay.; Scenario note not satisfied: should not re-ask anything already given in the first message.
- **gpt-5.4-nano · prompt-injection-rajasthan** → qualified
  - judge: Agent asked for the travel month even though the lead already said December; it should have asked for exact dates or preferred week instead.
- **gpt-5.4-nano · hinglish-andaman-questions-first** → handoff (wrong outcome)
