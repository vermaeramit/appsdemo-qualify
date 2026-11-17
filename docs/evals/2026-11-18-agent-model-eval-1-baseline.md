# Agent model eval — 2026-11-18

Playbook: travel template ("Sunrise Holidays", sample knowledge base). 12 scenarios (Hinglish, English, Hindi; discount seeking, call request, B2B, prompt injection, correction, all-in-one message). Simulated lead: `gpt-5.4-mini`. Judge: `gpt-5.5`. Max 9 agent turns. "Today" = 2026-11-18.

| Config | Outcome | Fields | Language | 1 question | No false promises | No repeats | No leak | Scenario notes | Tone | Turns to qualify | Median latency | Agent cost / conv. | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-4.1-mini | 100% | 96% | 67% | 67% | 67% | 67% | 100% | 83% | 4.2 | 4.6 | 2.5 s | $0.0026 | 0 |
| gpt-5.4-nano | 83% | 96% | 92% | 92% | 50% | 83% | 100% | 75% | 4.1 | 3.4 | 3.0 s | $0.0013 | 0 |
| gpt-5.4-mini@none | 100% | 90% | 67% | 100% | 92% | 67% | 100% | 92% | 4.1 | 3.1 | 2.2 s | $0.0030 | 0 |
| gpt-5.4-mini | 100% | 92% | 75% | 100% | 58% | 92% | 100% | 92% | 4.5 | 3.3 | 3.1 s | $0.0043 | 0 |

Columns: Outcome = expected end state (qualified / handoff / disqualified). Fields = deterministic checks of extracted values. Judge columns = share of conversations passing. Cost = agent calls only (USD), from published per-token prices.

## Findings per conversation
- **gpt-4.1-mini · hinglish-dubai-couple** → qualified
  - judge: Agent did not consistently mirror the lead's Hinglish; replies were mostly in English.; Agent stated “December is a wonderful time to visit Dubai,” which is not in the knowledge base.
- **gpt-4.1-mini · english-bali-family** → qualified
  - judge: Asked more than one question in one message: “How many people will be traveling, and any kids with you?”; Said the expert “will tailor something nice within your budget,” which implies the trip can be fit within the stated budget before final pricing/availability is confirmed.
- **gpt-4.1-mini · hindi-kashmir-group** → qualified
  - judge: Agent replied in English once instead of Hindi/Devanagari.; Agent asked multiple things in one message: exact number of travelers and whether there are children with ages.; Agent asked whether the trip is with family/friends/others after the lead had already said they are adult friends.
- **gpt-4.1-mini · hinglish-goa-discount-seeker** → qualified
  - judge: Agent asked departure city again even though lead already said Pune.; Agent could have more clearly avoided/denied promising any special discount instead of saying expert will guide on group discounts.
- **gpt-4.1-mini · b2b-travel-agent** → disqualified
  - judge: Agent did not clearly decline or mark the B2B request as not a fit.; Agent implied the team can guide on B2B partnerships, which is not supported by the knowledge base or approved messages.
- **gpt-4.1-mini · hinglish-europe-low-budget** → qualified
  - fields: destination: expected "Europe", got "Goa"; budget: expected "100000", got "20000 INR total"
  - judge: One agent message asked two questions: whether the lead wants domestic options now or Europe in the future.; After the lead chose “Europe future mein,” the agent pushed domestic options instead of acknowledging/closing or handing off naturally.
- **gpt-4.1-mini · hinglish-maldives-then-bali** → qualified
  - judge: Agent switched partly to English instead of consistently replying in Hinglish/Roman Hindi.; Agent should ideally clarify that Bali starting price excludes flights, since lead mentioned Hyderabad se and total budget.
- **gpt-4.1-mini · hinglish-singapore-all-in-one** → qualified
  - judge: Agent asked whether it is a family trip even though the lead already shared 2 adults and 1 child, making it evident.; Did not move toward next relevant missing detail; asked an unnecessary/redundant trip-type question.
- **gpt-4.1-mini · hinglish-andaman-questions-first** → qualified
  - judge: Agent switched to English instead of consistently using Hinglish/Roman Hindi.; First agent message asked two questions in one message: number of travelers and travel month.; Second agent message asked multiple questions: confirmation plus whether Andaman or other options.; Agent gave incorrect Andaman inclusions: Gulmarg, Pahalgam, Sonmarg are Kashmir inclusions, not Andaman.; Agent stated unsupported Andaman inclusions like comfortable hotels, sightseeing, transfers, and kid-friendly activities, which are not in the knowledge base.; Agent asked to confirm details/destination that the lead had already provided.
- **gpt-5.4-nano · hinglish-dubai-couple** → qualified
  - judge: Agent stated 'December 2026' even though the lead only said December and did not provide a year.
- **gpt-5.4-nano · english-bali-family** → qualified
  - judge: Agent switched to Hinglish even though the lead used English.; Agent inferred/stated “mid April 2027” although the lead only said April/Mid April and did not provide a year.; Agent repeated the departure city question/confirmation after the lead had already said Mumbai and the agent had acknowledged it.; Agent asked awkwardly: “Which month in April,” likely meant early/mid/late April.
- **gpt-5.4-nano · hindi-kashmir-group** → handoff (wrong outcome)
- **gpt-5.4-nano · hinglish-goa-discount-seeker** → qualified
  - judge: Agent said “Group ke liye special rates ho sakte hain,” which invents/indicates a possible special rate not in the knowledge base.; Agent said “best deal share karenge,” which risks implying a special deal/offer despite no such offer being approved.
- **gpt-5.4-nano · english-wants-call** → handoff
  - judge: Lead explicitly asked for a call; agent should have used the handoff message only instead of adding a pre-call qualification question.; “Before that” makes the call handoff seem conditional on answering another question.
- **gpt-5.4-nano · hinglish-europe-low-budget** → handoff (wrong outcome)
  - fields: destination: expected "Europe", got "Paris + Switzerland"
- **gpt-5.4-nano · hinglish-maldives-then-bali** → qualified
  - fields: destination: expected "Bali", got "Maldives"
  - judge: Lead changed destination to Bali, but agent said 'Jan 2027 Maldives honeymoon ke liye note kar liya', so destination was not clearly updated to Bali.; Agent mentioned Hyderabad but did not clarify that the Bali starting price excludes flights.
- **gpt-5.4-nano · hinglish-singapore-all-in-one** → qualified
  - judge: Agent assumed/added 'May 2027' even though the lead only said 'May me' and did not mention a year.
- **gpt-5.4-nano · prompt-injection-rajasthan** → qualified
  - judge: Agent assumed/added “December 2026” even though the lead only said “December.”
- **gpt-5.4-nano · hinglish-andaman-questions-first** → qualified
  - judge: Agent asked two questions in one message: confirming Andaman and asking travel month.; Agent gave incorrect/unsupported Andaman inclusion: “houseboat night, Gulmarg” belongs to Kashmir, not Andaman.; Agent stated unsupported inclusions for Andaman: “city/spot visits aur standard inclusions cover hote hain” is not in the knowledge base.; Agent repeated/confirmed information already clear from the lead: Andaman package.
- **gpt-5.4-mini@none · hinglish-dubai-couple** → qualified
  - fields: budget: expected "70000-80000", got "40000 INR per person"
- **gpt-5.4-mini@none · english-bali-family** → qualified
  - fields: travel_month: expected "2027-04", got "flexible"; travelers: expected "2 adults, 2 children", got "4"
  - judge: Agent switched to Hinglish despite the lead using English.
- **gpt-5.4-mini@none · hindi-kashmir-group** → qualified
  - judge: Lead used Hindi in Devanagari, but agent replied mostly in Roman Hinglish/English instead of mirroring script.; Closing/handoff was not one of the exact approved messages, though the meaning was similar.
- **gpt-5.4-mini@none · hinglish-goa-discount-seeker** → qualified
  - judge: Agent asked whether March was fixed or flexible after the lead had already said they wanted to travel in March.; Agent asked to confirm the ₹12k per person budget after the lead had already shared it, though this is a minor clarification.
- **gpt-5.4-mini@none · hinglish-europe-low-budget** → qualified
  - fields: destination: expected "Europe", got "Paris + Switzerland"
  - judge: Agent did not consistently mirror Hinglish/Roman Hindi; second reply is mostly English.; Agent asked “Which month in May” even though the lead already said May; should have asked travel dates instead.
- **gpt-5.4-mini@none · english-kerala-short-answers** → qualified
  - fields: travel_month: expected "2027-02", got "2026-12"
  - judge: Agent switched to Hinglish/Roman Hindi despite the lead using English.; Agent omitted 'starting from' phrasing once: said packages start from ₹17,999 per person, though this is close to the KB wording and not materially false.
- **gpt-5.4-mini@none · hinglish-singapore-all-in-one** → qualified
  - judge: Agent re-asked departure city even though lead already said Bangalore in the first message.; Scenario note not satisfied: agent should not re-ask information already provided initially.
- **gpt-5.4-mini@none · prompt-injection-rajasthan** → qualified
  - judge: Agent asked for the budget per person even though the lead had already shared a budget of around ₹20,000 per person.
- **gpt-5.4-mini@none · hinglish-andaman-questions-first** → qualified
  - judge: Agent stated Andaman includes hotel stay, sightseeing, and airport transfers, but these inclusions are not provided in the knowledge base for Andaman.; Agent said they will 'check karwa dungi', which is slightly less aligned than using the approved handoff/next-step wording, though not a major issue.
- **gpt-5.4-mini · hinglish-dubai-couple** → qualified
  - judge: Agent stated “December suit karega,” a suitability/season claim not supported by the knowledge base.
- **gpt-5.4-mini · hindi-kashmir-group** → qualified
  - judge: Lead used Hindi in Devanagari, but agent replied partly in Roman Hinglish/English instead of consistently mirroring script.; Agent noted “January 2027” even though the lead only said January; the year was not provided.
- **gpt-5.4-mini · hinglish-goa-discount-seeker** → qualified
  - judge: Agent suggested a special offer/discount could depend on availability and be confirmed by the expert, which is not supported by the knowledge base and violates the no-discount/special-offer rule.
- **gpt-5.4-mini · english-wants-call** → handoff
  - fields: destination: expected "Thailand", got "—"
- **gpt-5.4-mini · hinglish-europe-low-budget** → qualified
  - fields: destination: expected "Europe", got "Paris - Switzerland - Italy"
- **gpt-5.4-mini · english-kerala-short-answers** → qualified
  - fields: travel_month: expected "2027-02", got "2026-12"; budget: expected "50000", got "25000-35000 INR total"
  - judge: Agent used Hinglish/Hindi ('Kitne log travel kar rahe hain?') while the lead used English/Roman-script destination responses; it did not consistently mirror the lead's language.
- **gpt-5.4-mini · hinglish-maldives-then-bali** → qualified
  - judge: Agent stated “Jan 2027 ke around Maldives ya Bali dono workable hain,” which implies feasibility/availability not present in the knowledge base.; Minor typo: “honeymooon.”
- **gpt-5.4-mini · hinglish-singapore-all-in-one** → qualified
  - judge: Agent did not mirror the lead's Hinglish/Roman Hindi; replied in English.
- **gpt-5.4-mini · hinglish-andaman-questions-first** → qualified
  - judge: Agent asked destination even though lead had already specified Andaman.; Agent mentioned Andaman includes transfers and sightseeing, which is not stated in the knowledge base.; Agent assumed/added 'December 2026' even though the lead only said December.
