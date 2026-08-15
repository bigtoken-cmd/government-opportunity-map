# Government Opportunity Map — Jacob / Pro Backend Intelligence Handoff

> [!IMPORTANT]
> **ACTIVE IMPLEMENTATION PLAN — August 15, 2026.** This document supersedes `HACKATHON_PLAN.md` and `JACOB_CHECKLIST.md` for current ownership, scope, sequencing, verification cadence, and post-core work. Those files remain only as historical P0 records. `AGENTS.md` non-negotiable safety rules still apply.

> Copy this entire document into a new ChatGPT Pro/Codex chat opened on the repository at `/Users/lincolnberbert/Projects/government-opportunity-map-main`.

## Your role and authority

You are taking over the intensive backend and intelligence work for a time-constrained hackathon submission. Work directly in the repository, inspect the current implementation before changing it, preserve unrelated work, and verify changes proportionally to risk.

The repository's old ownership split is now stale for this work. The user has explicitly reversed it because Jacob has the ChatGPT Pro subscription and Lincoln has exhausted Cursor usage.

Use this ownership split:

- **Jacob + this Pro chat:** source retrieval, notice enrichment, canonical contracts, founder-profile normalization, eligibility, ranking, historical joins, result explanations, backend/API work, backend tests, and final integration/merges.
- **Lincoln + his Plus chat:** UI polish, visual hierarchy, responsive presentation, client components, and browser QA.
- **Shared seam:** the search-response contract. Keep it stable and additive so Lincoln can build UI against a fixture while backend work proceeds.
- Avoid editing `src/app/components/opportunity-workbench.tsx` and `src/app/globals.css` during backend work unless there is a very small, explicitly coordinated final integration step.
- Do not deploy, change Cloudflare resources, or modify secrets without explicit user authorization.
- The user has authorized a narrow Word/PowerPoint text-ingestion addition. Minimal, well-maintained parser dependencies may be added if necessary after checking Next.js/Cloudflare compatibility; do not add a general document-processing architecture.

The old ownership section in `AGENTS.md` should not be treated as the current personnel assignment. Its product-safety rules still apply unless this handoff explicitly narrows or clarifies them.

## Two-computer coordination

This plan governs both computers, even though the primary implementation prompt is written for Jacob's Pro/backend chat.

### Jacob's computer / Pro chat

- Own the backend/intelligence branch and the additive v2 contract.
- Primary areas: `src/lib/**`, `src/app/api/**`, source adapters, intake/document extraction, matching, explanations, persistence-contract changes, backend tests, and any necessary parser dependencies/lockfile changes.
- The first shared deliverable should be the v2 TypeScript contract plus a small typed UI test fixture so UI work does not guess the final shape.
- Avoid the workbench and global presentation files until the coordinated integration pass.

### Lincoln's computer / Plus chat

- Own the UI branch. If Jacob is physically operating this computer while Lincoln sleeps, still treat it as the Lincoln/UI workstream and preserve the same file boundary.
- Primary areas: `src/app/components/**`, `src/app/globals.css`, and UI-only tests/assets.
- Build and test against the shared typed v2 fixture. Do not recreate ranking, eligibility, government facts, or explanation logic in the client.
- Use the short UI checklist from the conversation as the execution checklist; the detailed UI section below is the reference when a rule is unclear.

### Start both computers from the same state

1. Pull the latest `origin/main` containing this handoff before either workstream starts.
2. Confirm the working tree is clean.
3. Use separate branches/worktrees; do not have both computers commit feature work directly to `main`.
4. Suggested branch names: `jacob-intelligence` and `lincoln-ui`.
5. Do not edit the other workstream's owned files without coordinating first.

### Integration order

1. Jacob freezes and pushes the additive shared contract/fixture early.
2. Lincoln updates the UI branch to that contract or fixture without pulling unfinished backend behavior into presentation work.
3. Both workstreams use focused checks while iterating and push their own branches at stable checkpoints.
4. Merge the complete backend/intelligence branch first.
5. Update/rebase the UI branch onto that merged state, resolve only the small API-to-component seam, and merge UI second.
6. Run the large final verifier/browser gate on the combined candidate, not repeatedly on both computers during small edits.
7. Keep `main` deployable and do not deploy until separately authorized.

If either computer finds that a requirement crosses the boundary, add an optional field to the shared contract or leave a clear integration note rather than silently implementing the same logic twice.

## The immediate objective

Improve the product's credibility, functionality, usefulness, and decision intelligence before the UI-polish pass, without significantly overscoping.

The key outcome is not “more infrastructure.” It is:

> Give a founder the strongest defensible government opportunities for their actual startup, explain why each is or is not a realistic route, support the conclusion with official evidence, and provide a precise next action.

The result behavior should be:

- Search a meaningfully broad but bounded candidate pool.
- Return up to **20 genuinely qualifying current or forecasted opportunities**, ordered by defensible fit.
- The UI will show the **best 5 by default**, with “show more” up to 20.
- Do not pad to five with weak matches. Five is a product target when at least five pass the gate, not permission to fabricate relevance.
- If only 1–4 opportunities are defensible, return only those.
- Preserve an honest zero-result state.
- Clearly distinguish direct routes, partner-dependent routes, critical-fact verification routes, and skips.

## User direction, verbatim

These are the user's relevant messages from the prior conversation.

### Original project assessment request

> Don't touch the code at all, but analyze this conversation, look at our project where it stands right now, look at the bounty doc, and tell me what you think. Maybe even look at/up the code for the past event, the one jobnimbus guy put his on github.

### Context about the competition and deadline

> Welp. I think we might be cooked then cuz these look really intense and technically impressive (design leaves some to be desired). Idk how people pulled these off.
>
> Here's the bounty we're working on right now:
>
> https://startupstate-hackathon-brief.lovable.app/
>
> and our current build can be viewed in:
>
> /Users/lincolnberbert/Projects/government-opportunity-map-main
>
> do you feel like our build is genuinely strong? We only have 10.5 hours left until submission deadline, and I feel like those other bounties required way more technical components that some builders managed to get in in time, which makes me think builders here will have a lot more functionality than us.

The 10.5-hour figure was accurate when that message was written; do not assume it is still the remaining time. Ask only if a precise current deadline is essential to a decision. Otherwise choose the smallest high-impact implementation.

### What the user wants fixed before UI

> we honestly haven't done a big UI pass yet, we are going to start that next, but I want to know what we're missing credibility/functionality/product usefulness wise first, also what do you mean by trust infrastructure?
>
> How can we make the plan more robust intelligence wise (check the plan files) without significantly overscoping and not having enough time to polish and add our features/nice-to-haves

### Result-count and parallel-work requirement

> We want at least top 5, with up to 20 shown if more truly fit the startup. Can we realistically decouple those tasks from UI so my brother can work on UI polish while I have you working on this?

### Ownership reversal and Luna permission

> Actually Jacob has the ChatGPT Pro subscription and I ran out of cursor and I only have ChatGPT Plus. We probably want him to handle the intensive backend stuff.
>
> Can you turn all of this into a .md or just a really detailed prompt we can give to a new chat? Give it enough of the context that you have so that it actually understands. Maybe even give it the messages I gave you earlier word for word or our entire chat pasted but just make sure you flip the rules. Also feel free to use the Luna API a little bit more in the process if it needs to generate the explanations as to why something's a good fit and stuff like that.

### Repository-baseline correction

> oh also make sure everything you're doing is up to date, I pulled pr8 mid convo

### Verification cadence, post-core options, and UI-plan update

> can't we just accept word/pptx in the code without all the edge case tests? Also one thing we might need to add to that handoff .md is we need to run verifiers WAY less. They're too rigorous right now and it's costing time, we just need whatever checks that the implemented code works, tests a couple quick edge cases, and then move on, then on big PRs do the actual verifiers, and spin up sub-agents to fix the mistakes.
>
> Also, add the accounts, emails, calendar, settings, and help center to a like "only after all of those are completed, push, wait for confirmation on which to proceed on (and alert jacob to wake lincoln if he's not awake)" section or something.
>
> Lastly, can you re-write my UI thing with the things that are missing while keeping it in my language (exact wording for the ones you aren't changing) Keep in mind we want as simple, easy to use, walkthrough-like as possible. The only other thing to add is like a short (~10-12 word max, 6-8 word optimal) H1 for our homepage.

### Confirmation editing, visual direction, and UI grammar

> Confirmation screen should let them edit all including what we know (with the little edit icons). Searching should also use one of these visuals (https://orbs.jakubantalik.com/), color scheme and font choices should be based off the utah GOED website (but font choice not exact, just inspired by but more professional looking) the UI should NOT be based off that website though, we want cleaner, more premium. Lastly, make sure it really knows not to add unnecessary elements, no text eyebrows, no bloated layouts (use the expand to show more) keep things really simple per visible screen. The dashboard should have clear tabs (like next steps tab with the to-dos/checklist on saved opportunities, opportunities tab, etc. But keep filters separate (I.e. don't put a filtered view in the tabs). Make sure everything has a role and the UX matches the role of the thing, rather than mixing them (I.e. tabs are for entirely different layouts, filters are for changing views of a layout type rules). Don't use the whole like split half sentence is a different color, italicized, or different font vibe-coding thing, and do your best to keep all fonts on a phi-scale.

## Important URLs and local paths

- Repository: `/Users/lincolnberbert/Projects/government-opportunity-map-main`
- Current deployed build: `https://government-opportunity-map.bigtoken.workers.dev/`
- Bounty brief: `https://startupstate-hackathon-brief.lovable.app/`
- Previous JobNimbus-winning repository examined for comparison: `https://github.com/gobixplr-svg/aibuilderday-2026`
- Active plan: `/Users/lincolnberbert/Projects/government-opportunity-map-main/JACOB_BACKEND_INTELLIGENCE_HANDOFF.md`
- Historical P0 plan: `/Users/lincolnberbert/Projects/government-opportunity-map-main/HACKATHON_PLAN.md` — deprecated for active decisions.
- Repository rules: `/Users/lincolnberbert/Projects/government-opportunity-map-main/AGENTS.md`
- Existing UI handoff: `/Users/lincolnberbert/Projects/government-opportunity-map-main/JACOB_CHECKLIST.md` — its ownership assumptions are now stale.

## Bounty priorities

The bounty is not primarily a raw technical-complexity contest. Its scoring is approximately:

- 30% usefulness
- 25% matching quality
- 20% intelligence and insight
- 15% UX
- 10% technical execution

The brief favors a focused product using a few strong sources over a superficial system with many integrations. The intended experience is closer to a personal government-funding intelligence analyst than a grant search portal.

The brief wants the product to:

- Understand the startup's context.
- Discover relevant opportunities.
- Go beyond superficial keyword matching.
- Explain why an opportunity fits.
- Explain possible ineligibility or what must be verified.
- Give a useful next action.
- Use history such as similar recipients, total/typical awards, Utah recipients, or related program evidence where support exists.
- Correctly tell a startup when no strong traditional grant fit exists.

A core result should ideally convey program/opportunity, agency, funding value, deadline, why it fits, concerns, historical evidence, and next steps.

Do not optimize for architecture points while leaving result quality generic.

## Current product and engineering state

### Exact repository baseline

This handoff was re-audited after the user reported pulling PR8.

- GitHub PR8, **“Record verified P0 production rollout,”** is merged: `https://github.com/bigtoken-cmd/government-opportunity-map/pull/8`.
- PR8 merged `p0-deployment` into `main` as merge commit `c9aeb4fc6fc66e3218bfd4724c932cd272f90345`.
- The local repository's `HEAD`, `main`, and `origin/main` were all at `c9aeb4f` when this handoff was finalized.
- PR8 changed only `HACKATHON_PLAN.md`, `JACOB_CHECKLIST.md`, and `README.md`. It did not change application code, matching logic, source adapters, API contracts, or tests.
- Therefore, the implementation analysis and file-level intelligence gaps below are based on the post-PR8 tree.
- The only local working-tree addition at handoff time was this uncommitted Markdown file.

At that post-PR8 assessment:

- Git was clean on `main`, tracking `origin/main`.
- `npm test` passed **93/93** tests.
- The deployed app was working and technically polished enough to exercise end to end.
- Website, manual, and PDF/pasted evidence intake existed.
- The founder confirms a profile before searching.
- Grants.gov provides current/forecast opportunity records.
- Assistance Listings are kept as program context only.
- USAspending and SBIR are kept as historical evidence only.
- Source states distinguish live, cached, cached fallback, and unavailable.
- Current opportunities and historical awards are not conflated.
- The app has deterministic scoring, eligibility checks, no-match behavior, provenance, persistence, and an application workspace.
- D1 workspace persistence and opaque credentials were verified.
- Assistance Listings and SBIR persistent deployed stores/scheduler remained blocked and are not the highest-priority use of remaining time.

### Existing trust infrastructure

“Trust infrastructure” refers to the mechanisms that answer: can the user trust the system not to invent facts, confuse source roles, leak data, or silently break?

The project is already relatively strong here:

- Official-source provenance and links
- Retrieval timestamps and freshness/fallback labeling
- Separation of current opportunities, program context, and historical awards
- Deterministic hard eligibility boundaries
- Honest no-match behavior
- External-model consent
- Sanitization and credential redaction
- Server-only API secrets
- Hashed workspace tokens and durable persistence
- Fixture and regression coverage

This is valuable, but it is not the same as decision intelligence. The current system is better at “not lying about the machinery” than at “resolving the evidence into the best founder decision.”

## Observed live-product problems

The deployed app was tested with the official water-style profile.

### Intake left important supplied facts unused

The manual evidence contained facts such as employee count, revenue, capital raised, funding need, use of funds, and applicant type. Luna extracted only a narrow subset such as description, industry, technology, location, customers, and research activities.

This behavior follows the code:

- `src/lib/intake/evidence-profile.ts` allows only a narrow field set.
- `src/lib/intake/luna-extraction.ts` uses a similarly narrow founder-profile schema.
- `src/lib/intake/profile-normalization.ts` does not meaningfully use employees, revenue, capital raised, ownership, product maturity, or funding stage for matching.

The safe improvement is to extract additional facts only when explicitly stated in supplied evidence. Do not speculate.

### Results were generic and insufficiently differentiated

The water search took roughly 30 seconds and returned three results, all with a score around 65 and nearly identical explanations, concerns, and next steps.

Examples included:

1. Desalination and Water Purification Research Program: Research Projects
2. FY2026 Water Resources Research Act Non-Competitive Coordination
3. Title XVI Water Reclamation and Reuse Projects

The cards repeated generic language such as:

- Critical facts not verified: exact notice applicant type, SAM registration, UEI
- The same matched-evidence-group text
- The same instruction to open the notice and verify applicant type, registration, scope, and deadline

The app showed no useful funding amount for these cards, and historical/program intelligence was generally unavailable in the experience.

### Known eligibility-quality failure

At least two of those three results were not straightforward direct-startup opportunities:

- The Water Resources Research Act noncompetitive route is for designated water research institutes or higher-education institutions.
- The Title XVI route is for state/regional/local or water-delivery authorities and authorized project sponsors.

For an ordinary startup, those should be either:

- Clearly labeled **partner-dependent**, with the eligible partner type identified, or
- Excluded from direct routes.

They should not be generic “Potential Fit — Verify first” recommendations.

This is the most important credibility gap: the system finds thematic similarity but does not resolve the actual applicant route deeply enough.

## Current code architecture and collision points

### Backend/intelligence files

- `src/lib/opportunity-types.ts`
- `src/lib/opportunity-discovery.ts`
- `src/lib/opportunity-matching.ts`
- `src/lib/opportunity-search.ts`
- `src/lib/opportunity-explanation.ts`
- `src/lib/concept-normalization.ts`
- `src/lib/intake/*`
- `src/lib/sources/*`
- `src/app/api/opportunities/search/route.ts`
- Relevant `tests/*`

### UI files Lincoln should own during parallel work

- `src/app/components/opportunity-workbench.tsx`
- `src/app/globals.css`
- Any new presentational components extracted from the workbench

### Main seam to stabilize

`src/app/components/opportunity-workbench.tsx` is roughly 1,740 lines and currently combines UI, client state, API calls, local view types, backend-to-card mapping, and generic explanation wording.

The main collision point is `mapDiscoveryRecommendation()` around line 245. It currently creates generic `reasons`, `concerns`, `relationship`, and `nextAction` values on the client.

Backend intelligence should ultimately provide those semantic fields. UI should render them rather than independently decide what an opportunity means.

To support parallel work:

- Freeze an additive response contract early.
- Keep all existing response fields working during the branch split.
- Add fields; do not rename or remove existing fields before integration.
- Give Lincoln a realistic fixture of the new response.
- Allow one small coordinated integration pass at the end.

## Current matching limitations visible in code

### Candidate retrieval

`src/lib/opportunity-search.ts` currently selects at most one exact term and one controlled term. Technology/R&D is used mainly as a fallback when those groups produce no query.

`src/lib/sources/grants.ts` requests 25 Grants.gov records per query. This often yields a raw candidate pool of 25–50 before deduplication, so returning up to 20 is realistic without a new source. Recall may still improve through a carefully bounded third query or better term selection; do not create an unbounded query explosion.

### Opportunity normalization

`src/lib/opportunity-discovery.ts` currently derives most matching concepts from title plus description. It leaves geography empty, frequently has no amount, and hardcodes these unverified critical fields for every opportunity:

- exact notice applicant type
- SAM.gov registration
- Unique Entity ID

It does not yet deeply normalize notice-specific applicant eligibility or distinguish direct from partner routes.

### Result cap

`src/lib/opportunity-discovery.ts` filters skips and low scores, then calls `.slice(0, 5)`. The plan already says an all-qualifying view capped at 20 is planned.

Changing the numeric slice alone is not the goal. The quality gate must improve before exposing more cards.

### Generic client explanation

`mapDiscoveryRecommendation()` in the workbench reduces the backend result to generic matched-group text and a fixed next action. Do not solve this only by producing more eloquent generic prose.

## Desired result semantics

Every returned recommendation should resolve to one of these decisions:

- **Pursue directly:** supported direct applicant route and meaningful thematic/project fit.
- **Verify one critical fact:** fit is meaningful, but one named fact changes the decision.
- **Partner-dependent:** startup cannot apply directly, but a relevant eligible partner route is supported.
- **Watch:** relevant program/forecast, but not actionable now.
- **Skip:** known ineligibility, expired/closed status, superficial thematic overlap, or insufficient evidence.

For every displayed recommendation, provide:

1. A specific decision label.
2. A concise decision reason.
3. Two or three founder facts mapped to actual notice facts.
4. A real concern, blocker, or verification item.
5. Funding amount/range when the official notice exposes one; otherwise “not stated,” never guessed.
6. Deadline/status from the official record.
7. Direct versus partner route.
8. A precise next action.
9. Source ID, official URL, and retrieval timestamp for government facts.
10. Historical support when available, without presenting history as a current opportunity.

A strong explanation resembles:

> Your pilot-ready municipal water sensor matches the notice's water-treatment research scope and public-utility use case. However, the notice restricts applicants to designated water research institutes. Treat this as a university-partnership route rather than a direct startup grant. Next: prepare a one-page pilot concept and approach an eligible Utah research institution before the notice deadline.

That example may only be used if every factual clause is supported by founder evidence or an official notice fact.

## Stable additive API contract

### Contract status — do not misread this

As of the post-PR8 code audited for this handoff, the **implemented production contract is still v1**:

- discovery still truncates recommendations with `.slice(0, 5)`
- there is no `resultMeta`, `RecommendationIntelligence`, `routeType`, structured why-fit mapping, or per-recommendation historical-support object
- workspace state is version 2 with only `selectedOpportunityId` and `checklistByOpportunity`
- evidence intake accepts one `manual` or `pdf` text source per request and does not represent five combined files/website sources
- the search request returns one final JSON response and exposes no live progress events

The contract below is a **proposed additive v2 target**, not something already frozen or implemented. Freeze it only after the recent UI requirements are represented. Do not tell Lincoln that the live backend already supports these fields.

The contract freeze does not prevent UI work or UI tests. Lincoln should build component/interaction tests against a small typed, test-only v2 fixture while Jacob implements the backend. The fixture must use the shared contract types, must not contain official verifier-profile reward answers, and must never be imported into production behavior. Final API integration tests must wait until the additive backend fields exist.

Do not unnecessarily replace the existing nested `GovernmentSourceSearchResult` and `DiscoveryRecommendation` shapes. Add semantic fields in a backward-compatible way.

A reasonable target is conceptually:

```ts
type RouteType = "direct" | "partner" | "verify" | "watch";

interface EvidenceMapping {
  companyFact: string;
  companyEvidenceId?: string;
  opportunityFact: string;
  opportunityEvidenceId: string;
  sourceUrl: string;
}

interface RecommendationConcern {
  severity: "blocking" | "verify" | "caution";
  text: string;
  evidenceId?: string;
  sourceUrl?: string;
}

interface RecommendationAction {
  type: "apply" | "verify" | "find-partner" | "monitor";
  text: string;
}

interface RecommendationIntelligence {
  routeType: RouteType;
  decisionSummary: string;
  whyFit: readonly EvidenceMapping[];
  concerns: readonly RecommendationConcern[];
  nextAction: RecommendationAction;
  historicalSupport?: {
    awards: readonly HistoricalAwardRecord[];
    typicalAwardAmount?: number;
    utahRecipients?: readonly string[];
    limitation?: string;
  };
}

interface DiscoveryResultMeta {
  qualifyingCount: number;
  returnedCount: number;
  defaultVisible: 5;
  resultCap: 20;
  truncated: boolean;
}
```

Exact names may differ after inspecting the code, but preserve these semantics. Prefer a compact, source-backed contract over a sprawling view model.

The backend should return up to 20 ordered recommendations. The client owns whether only five are initially expanded or rendered.

Before calling v2 frozen, also represent these newer requirements with the smallest additive fields:

- **Intake sources:** bounded source summaries for website/manual/PDF/DOCX/PPTX with source ID, type, display name/URL, extraction status, and provenance; raw binaries are not persisted.
- **Editable confirmation:** enough field evidence/origin state for the UI to distinguish extracted, founder-entered/edited, and unknown values. Founder edits may be tracked as client view state if durable field-origin history is not required.
- **Saved opportunities:** `savedOpportunityIds` (ordered), plus a small per-opportunity pursuit state such as Saved/Verifying/Pursuing/Done.
- **Next Steps:** checklist data remains opportunity-scoped; add notice-specific document requirements only when sourced. The aggregate tab can derive its super-list from those per-opportunity requirements.
- **Empty state:** no backend field is needed; the UI derives it when `savedOpportunityIds` is empty.
- **Card next action:** keep the per-recommendation `nextAction`; the Next Steps tab separately aggregates complete saved work.
- **Search animation:** do not add streaming/SSE merely for the orb. With the current one-response endpoint, display one accurate pending message. Add progress events only if another backend requirement already justifies streaming.

Version persisted workspace data if its shape changes, and include a backward-compatible hydration/migration path from workspace version 2. Do not silently reinterpret old saved state.

## Recommended backend implementation order

Use the remaining time for depth, not horizontal expansion.

### Phase 1 — Freeze the seam

1. Inspect the current git branch/status and all applicable repository rules.
2. Inspect tests and the current search response.
3. Define the smallest additive recommendation-intelligence contract.
4. Create a realistic fixture Lincoln can use during UI work.
5. Avoid touching the actual workbench while Lincoln is modifying it.

### Phase 1A — Add narrow multi-document intake

Support the intended intake without turning this into a document-processing project:

- Accept text/manual evidence, a company website, PDF, `.docx`, and `.pptx`.
- Allow at most five uploaded files total.
- Let the founder supply a website and uploads together rather than forcing mutually exclusive intake methods.
- Extract ordinary document text only and combine it into a bounded evidence packet with per-source provenance.
- Preserve file names/types in the review UI, but do not persist raw file binaries server-side.
- Keep the existing consent, redaction, size limits, and Luna evidence boundary.
- Fall back honestly to pasted text when a supported document cannot be read.

Explicitly do **not** support legacy `.doc`/`.ppt`, OCR, password-protected files, macros, speaker-note fidelity, complex tables/charts, embedded media, or perfect layout reconstruction for the hackathon build.

Testing should be intentionally small:

- one ordinary happy-path `.docx` fixture
- one ordinary happy-path `.pptx` fixture
- one five-file/count or total-size boundary
- one unreadable/unsupported failure path that produces an honest paste-text fallback

Do not build an exhaustive office-file corpus. The important contract is that ordinary text reaches the same evidence-backed profile pipeline and failures remain visible.

### Phase 2 — Improve founder facts safely

Expand evidence-backed extraction and normalization for explicitly stated fields that materially affect matching or advice:

- employee count
- revenue
- capital raised
- funding need
- use of funds
- applicant/legal entity type
- ownership, when stated
- product or research stage, when stated
- small-business/U.S.-entity indicators, when stated

Requirements:

- Every extracted value must be traceable to supplied evidence.
- Unknown remains unknown.
- Do not infer legal eligibility from vague marketing copy.
- Do not add founder contact data to matching or Luna explanation prompts.

### Phase 3 — Improve candidate recall without noise

Review `buildSearchQueries()` and improve bounded query coverage only as needed. Consider exact, controlled, technology/R&D, and public-customer/use terms, but cap query count and deduplicate aggressively.

The desired funnel is:

```text
verified profile
  -> bounded search queries
  -> deduplicated current/forecast candidates
  -> inexpensive coarse thematic score
  -> official notice enrichment for a bounded top candidate set
  -> hard route/eligibility checks
  -> final score and decision
  -> return up to 20 qualifying results
```

Do not enrich hundreds of records. Choose a bounded set large enough to support 20 final results, such as the top 20–30 coarse candidates, with bounded concurrency and failure handling.

### Phase 4 — Enrich opportunity truth

For the bounded candidate set, retrieve or normalize the smallest official notice details required for a founder decision:

- eligible applicant types
- direct applicant route versus required partner
- award ceiling/floor or estimated range
- deadline and status
- geography
- cost share, when materially required
- assistance listing/program number
- application route
- source URL and retrieval timestamp

Prefer a supported official API/detail endpoint over page scraping. If exact details are unavailable or retrieval fails, retain an explicit unknown state; do not fill it with model inference.

Hard eligibility and route classification must remain deterministic.

### Phase 5 — Produce opportunity-specific intelligence

Build a deterministic evidence packet for each result:

- relevant founder facts and their evidence references
- relevant opportunity facts and provenance
- deterministic eligibility checks
- deterministic decision and score
- historical records, when supported

Generate specific mappings, concerns, and next actions from that packet. Deterministic text is the required fallback.

### Phase 6 — Add bounded historical support

Do not build a large similar-company engine.

Start with compact support for the best five recommendations:

- up to three relevant historical awards per result when available
- award amount
- recipient
- assistance listing
- Utah recipient indicator when supported
- an honest limitation when the evidence is sparse

If time is tight, prioritize a strong history panel for result #1 and preserve optional fields for the remaining results.

### Phase 7 — Return five by default, up to twenty

Backend behavior:

- Rank all processed qualifying results.
- Return a maximum of 20.
- Include result metadata.
- Preserve fewer-than-five and no-match behavior.
- Do not lower the threshold simply to reach five.

UI behavior belongs to Lincoln:

- Initially show the best five.
- Display “Show N more” when 6–20 exist.
- Keep the remaining results ordered.

## Luna / OpenAI role

The user has authorized using the Luna API somewhat more for result explanations, but that does **not** authorize Luna to decide government facts or eligibility.

The existing implementation uses `gpt-5.6-luna` through the Responses API for consent-gated structured extraction. Existing safety properties include:

- server-only `OPENAI_API_KEY`
- `store: false`
- explicit external-processing consent
- redaction/sanitization
- strict response-shape validation
- timeout and provider-error fallback
- no model control over government facts, eligibility, scores, dates, amounts, totals, or provenance

Preserve those properties.

### Permitted Luna task

Luna may perform a constrained wording pass over an already-computed evidence packet. It may:

- Turn selected evidence mappings into concise founder-friendly sentences.
- Improve clarity and avoid repetitive wording.
- Phrase a deterministic concern.
- Phrase a deterministic next action.

It may not:

- Decide or alter eligibility.
- Choose the decision label.
- Change the score or ranking.
- Add a number, date, applicant rule, recipient, program fact, or source.
- Invent a contact, partner, deadline, award amount, or historical statistic.
- Convert unknown into known.
- use founder name/email or unnecessary personal data.

### Recommended Luna schema

Send a bounded evidence packet with opaque evidence IDs and require structured output similar to:

```json
{
  "decisionSummary": "...",
  "whyFit": [
    {
      "companyEvidenceId": "company-technology",
      "opportunityEvidenceId": "notice-scope-2",
      "sentence": "..."
    }
  ],
  "concerns": [
    {
      "evidenceId": "notice-applicant-types",
      "sentence": "..."
    }
  ],
  "nextAction": "..."
}
```

Validate that:

- Every referenced ID exists in the packet.
- Every number and date appears exactly in the packet.
- The output does not change the deterministic route or decision.
- The output contains no unsupported proper noun.
- The output stays within strict length limits.
- Invalid or timed-out output falls back to deterministic wording.

The current disclosure says supplied evidence is sent to OpenAI for “profile-field suggestions.” If explanation generation sends founder/company evidence too, update the end-user disclosure and consent scope transparently. Implementation permission from the developer is not a substitute for end-user consent.

If a safe, bounded wording pass will consume disproportionate time, ship deterministic specific explanations first. Specific evidence matters more than model-generated elegance.

## Quality and verification gate

The current verifier suite is intentionally rigorous, but repeatedly running the entire gate after small changes is consuming too much hackathon time. Use a two-speed verification strategy.

### Fast loop during implementation

After a small coherent edit:

- Run only the focused test file(s) for the code touched.
- Add or run one ordinary success case and one or two high-value failure/edge cases.
- Run a narrow TypeScript/lint check only when the edited boundary makes it useful.
- If the focused checks pass, move to the next implementation slice.
- Do not run the entire test suite twice, a production build, the browser matrix, deployment checks, or all external-source verifiers after every small edit.

Examples:

- Document parser edit: parser happy path, limit rejection, honest unreadable fallback.
- Eligibility edit: direct, partner, and known hard-failure cases.
- Luna wording edit: valid evidence IDs, unsupported claim rejection, deterministic fallback.
- Result-cap edit: 0–4, 5, 6–20, and never more than 20.

### Full gate only at real checkpoints

Run the full relevant verifier set when:

- finishing a large cross-cutting implementation phase
- preparing a substantial PR or merge
- changing a shared API/source/persistence/security contract
- preparing the final push/deployment candidate

At those checkpoints, run the full suite, lint, TypeScript, build, `git diff --check`, and only the browser/live checks relevant to the changed behavior. Do not automatically repeat the entire gate twice unless the first run exposed nondeterminism or the final submission checklist explicitly requires two passes.

If a large checkpoint exposes multiple independent failures, spin up sub-agents to diagnose/fix them in parallel. Give each sub-agent a bounded, non-overlapping file/test area, keep one agent responsible for integration, and rerun the focused failing checks before the final full gate. Do not use multiple agents to edit the same contract simultaneously.

The current suite proves that the pipeline runs and honors safety boundaries. The final checkpoint should also include a human-meaningful result-quality gate.

For each positive test profile, review at least the top five returned results or all results if fewer than five exist. Score each on:

- relevance to the actual startup/project
- direct applicant eligibility or correctly labeled partner route
- evidence specificity
- concern specificity
- actionability
- source/provenance completeness
- historical support, when available

Use simple 0/1/2 judgments and document the rationale. Do not optimize production output directly for fixture IDs or hard-code fixture-specific answers.

### Required behavioral assertions

- Institutional-only opportunities never appear as direct startup fits.
- A partner-dependent result names the eligible partner category and why a partner is necessary.
- A known hard failure is excluded or clearly placed in a non-actionable excluded group.
- Unknown eligibility remains unknown and caps certainty appropriately.
- Every displayed official fact has source provenance.
- Every “why fit” sentence maps a founder fact to an opportunity fact.
- No two top cards receive an identical generic explanation merely because their scores match.
- Amounts and deadlines are never guessed.
- Historical awards are never presented as open opportunities.
- The difficult consumer/youth-marketplace profile returns no direct traditional grant recommendation when no defensible route exists.
- Search can return 0–4 recommendations honestly.
- Search can return 5 by default when at least five pass.
- Search can return between 6 and 20 when that many pass.
- Search never returns more than 20.
- Ordering is deterministic for equal inputs and source snapshots.
- Upstream detail failures produce explicit unknown/fallback behavior rather than fabricated data.

### Known water regression

Add or strengthen a regression showing that institutional Water Resources Research Act and Title XVI-style notices cannot be labeled as direct startup routes when official applicant restrictions say otherwise. They may be partner-dependent only when the thematic fit is meaningful and the necessary partner category is explicit.

### Performance

The observed live water search took roughly 30 seconds. Avoid making this worse.

Prefer:

- parallel bounded source queries
- coarse ranking before detail enrichment
- bounded concurrency for notice detail calls
- timeouts and partial honest results
- progressive client messaging if Lincoln implements it

Do not sacrifice correctness for an arbitrary latency target, but aim for a credible demo experience rather than a long blank wait.

## Scope cuts

Do not prioritize these until the result-quality gate passes:

- Persistent Assistance Listings/SBIR scheduler architecture
- Additional broad source adapters
- A comprehensive Utah data graph
- Deep application-assistant automation
- RAG, embeddings, autonomous agents, or a vector database
- A comprehensive similar-company engine
- Direct government-form submission
- More persistence polish
- Decorative AI features

The highest-value slice is:

> Better profile facts + official notice enrichment + deterministic route classification + specific evidence mappings + precise next actions + compact historical support.

## Post-core optional-feature checkpoint

Accounts, email reminders, calendar integration, settings, and the help center are not permanently rejected. They are queued options that must wait until **all** core intelligence, intake, contract, result-count, explanation, focused-test, and final-checkpoint requirements in this handoff are complete.

When the core work is complete:

1. Run the appropriate final full gate once.
2. Commit the complete coherent backend/intelligence work.
3. Push the current working branch so Lincoln's UI work can integrate against a stable remote state. Do not deploy unless separately authorized.
4. Report the pushed commit/branch, contract changes, checks, and remaining limitations.
5. Stop and ask the user which single post-core option to proceed with next:
   - accounts/login
   - email reminders
   - calendar integration
   - settings/theme/account controls
   - help center/FAQ
6. Do not start any of those options before receiving confirmation.
7. Include a clear coordination alert for Jacob: **check whether Lincoln is awake/available and wake or contact him before choosing work that affects his UI branch.** The agent cannot contact him outside available tools, so make this an explicit user-facing action item rather than pretending a message was sent.

Only one post-core option should be authorized at a time. Prefer the smallest demo-complete version, and do not allow optional SaaS features to delay integration, polish, or submission.

## Relationship to the current plan

`HACKATHON_PLAN.md` is strong on engineering and trust boundaries but currently treats mechanics as a proxy for intelligence. It verifies source states, counts, pipeline behavior, persistence, and deployment more thoroughly than per-result recommendation quality.

Do not spend scarce time deleting that history. Add a concise intelligence gate or handoff section only if documentation changes help coordinate the branches.

The old plan says:

- Default top five qualifying results are implemented.
- An all-qualifying view capped at 20 is planned.
- Optional constrained model wording is planned.
- Assistance Listings/SBIR stores remain blocked.

This task should turn the first three into a credible, source-backed result experience while continuing to defer the last item.

## Working procedure for the new chat

1. Read `AGENTS.md`, this active handoff, `README.md`, the current source contracts, search/matching/intake code, and relevant tests completely enough to understand the actual implementation. Read `HACKATHON_PLAN.md` only when historical P0 evidence is needed; do not treat it as current direction.
2. Inspect `git status`, branches, and recent commits. Preserve all existing user work.
3. Treat the ownership split in this document as the user's latest instruction.
4. Produce a compact implementation plan with at most one step in progress.
5. Establish the additive response contract and a UI fixture first.
6. Work only on the backend/intelligence side until the integration pass.
7. Use official primary government sources for government facts. Browse official docs if an API/detail endpoint must be verified.
8. Implement the smallest coherent intelligence loop before optional enhancements.
9. Use the fast focused-test loop during implementation. Run the full suite/lint/TypeScript/build/diff gate only at the large checkpoints defined above.
10. Do not claim live/deployment/browser verification that was not actually performed.
11. The user has authorized one commit and push of the complete coherent core work after its final checkpoint. Do not push partial work, open a PR, deploy, or modify other external resources without separate authorization.
12. At handoff, list changed files, tests run, known limitations, response-contract changes, the pushed commit/branch, and the one small integration task Lincoln's UI branch needs; then follow the post-core confirmation checkpoint.

## Definition of done

The backend intelligence pass is done when:

- It can return up to 20 qualifying ordered recommendations.
- It preserves honest 0–4 result states and never pads.
- The top five are based on enriched applicant-route and notice evidence, not title similarity alone.
- Direct, partner, verify, watch, and skip semantics are defensible.
- Results contain distinct source-backed why-fit mappings, concerns, and next actions.
- Important explicitly supplied founder facts are safely captured and used where relevant.
- At least compact historical support is available for the strongest result when official evidence supports it.
- Luna, if used, only rewrites validated evidence packets and has a deterministic fallback.
- Existing provenance, source-role, no-match, consent, secret, persistence, and safety boundaries still pass.
- Lincoln can finish the UI using a stable fixture and without recreating matching logic on the client.
- The full repository remains deployable.

## Rewritten UI plan in the user's language

This is the updated UI direction for Lincoln. Keep it as simple, easy to use, and walkthrough-like as possible. There should basically always be one obvious next thing to do on each screen; avoid making it feel like a dashboard full of choices.

### What do we want our UI to look like?

**Government Resource Finder**

Homepage H1:

> **Find the right government resources for your startup.**

Eight words. Keep the supporting copy short and immediately start the walkthrough.

### Visual direction and restraint

- Use the Utah GOED site/screenshots only as loose brand inspiration: deep Utah navy, brighter civic blue, white, and restrained pale neutral backgrounds, with straightforward institutional confidence.
- Do **not** copy the GOED site's page layout, navigation density, government portal structure, component styling, or content hierarchy. This product should feel cleaner, quieter, more premium, and more software-like.
- Use a professional serif for major page/section headings, inspired by GOED's editorial headings, paired with one highly legible professional sans for body text, controls, metadata, and product UI. The pairing should feel more polished than a government template and remain restrained.
- Do not hard-set a final list of font sizes in the plan. Choose an accessible base size in the actual UI, calculate the hierarchy from that base using a phi/golden-ratio modular scale, and visually test it at desktop and mobile sizes. Adjust the base/rounding if needed while keeping the scale mathematically coherent.
- Never style half of a sentence in a different color, italic, weight, or font just to make a heading look designed. No gradient text, split-color headlines, random italic fragments, or mixed-font sentences.
- No text eyebrows: do not put tiny uppercase, widely tracked labels above headings. A heading should be the heading.
- Do not add decorative elements, helper cards, badges, dividers, sidebars, charts, icons, or copy unless they perform a necessary role.
- Avoid bloated layouts. Prefer a compact visible state with **Expand** or **Show more** for secondary detail.
- Do not put every piece of content inside its own rounded card. Use grouping, spacing, and hierarchy first; use a container only when it communicates a real boundary or interaction.
- Keep one primary action per visible screen. Secondary actions should be visually quiet and located beside the content they affect.
- Use consistent, moderate radii, subtle borders, and very restrained shadows. Premium should come from proportion, spacing, typography, and interaction quality—not glassmorphism or excessive effects.
- Each visible screen should answer one question and support one main task.

### Intake

Input text, pdf, word docs, and .pptx, should ask for the website. 5 file limit on UPLOADS.

- Technically, support normal `.pdf`, `.docx`, and `.pptx` files; do not promise old `.doc`/`.ppt` files, OCR, password-protected files, macros, or embedded media.
- They should be able to add the website and uploads together, not have to pick only one method.
- Show the files they added in a really simple list where they can remove one before continuing.
- If we cannot read a file, just tell them and let them paste the text instead.
- Keep one main button: **Continue**.

Once they drop in everything, it runs the extraction, and asks about the unfilled fields (multiple questions one per screen with a clear counter that isn’t overwhelming), a few optional fields is good/beneficial as a final page with ALL the optional fields in one place.

- Ask only questions that actually matter for matching first.
- Keep the counter simple, like **2 of 6**.
- One question, one short explanation of why we need it, Back, and Continue.
- Do not make them look at the whole business form until the final confirmation page.
- If there are no missing required fields, skip straight to optional fields/confirmation.

Then, confirm the data -> find resources.

- The confirmation screen should separate **What we know**, **What you added**, and **Still unknown** without making unknown fields feel like errors.
- Every field must be editable, including extracted fields under **What we know**. Put a small, consistent edit icon beside each field/value; activating it should edit that field in place without sending the user back through the entire question flow.
- The edit icon means edit only. Do not use it for expand, history, verification, or any other action.
- Clearly preserve which values were extracted, entered by the founder, or remain unknown after an edit, without making provenance dominate the screen.
- One main button: **Find my resources**.

### While it searches

Do not leave them on a blank spinner. Keep it walkthrough-like with one short, accurate active message such as **Searching current opportunities and checking fit…** Do not build fake staged progress. The existing endpoint returns one final response and does not expose live phases; only show multiple changing/completed steps if the backend later provides truthful phase events.

- Use a single animated orb visual inspired by [`thinking-orbs`](https://orbs.jakubantalik.com/) as the functional search-status object.
- Use the orb's searching/working state and let its label change with the real search step. Do not scatter multiple decorative orbs around the product.
- Adapt the surrounding color treatment to the navy/blue/white Utah-inspired palette; do not copy the reference site's black page design.
- Respect `prefers-reduced-motion` and provide a calm static/subtle-motion fallback.
- The orb has one role: communicate that the system is actively working. It is not a logo, mascot, decoration, navigation element, or permanent dashboard object.

### Results

Pulls up a list with all the opportunities, clean UI, all relevant details, can click on an opportunity to expand it and learn more, explanation should be 3 sentences max & bullet points (where they match vs where it’s iffy, NO hard disqualifiers).

- Show the best 5 first, with a **Show N more** button if 6–20 truly fit.
- If only 1–4 truly fit, show only those. Do not add weak ones just to reach five.
- If nothing truly fits, have a useful no-match screen that explains why and what kind of route may make more sense.
- Keep cards compact before they expand: title, agency, possible amount, deadline, relevance, and one clear decision.
- The clear decision should be one of: **Pursue**, **Verify one thing**, **Needs a partner**, or **Watch**.
- Known hard-disqualified opportunities should not appear as recommendations at all. “Where it’s iffy” is only for unknown facts, a real partner requirement, cost share, registration, or something else that could still be resolved.
- The expanded view should have really short sections:
  - **Why it matches** — specific bullet points connecting their company to the opportunity
  - **What’s iffy** — specific bullet points, not generic warnings
  - **What to do next** — one actual next action
  - **Past proof** — similar/historical awards when we really have them
- Clearly label **Current opportunity**, **Forecast**, **Partner route**, and **Historical evidence** so those never blur together.
- Keep the official source, retrieval date, and source/fallback status available but visually quiet near the bottom.
- No giant score breakdown by default. The decision and explanation should matter more than the number.

Filters to filter by highest $$ amount, nearest due date, and default is highest relevance.

- Only sort by amount when a real amount exists; unknown amounts go after known ones rather than pretending to be $0.
- Nearest due date should not push an irrelevant result above a relevant one unless they actively select that filter.

### Dashboard navigation and interaction grammar

Once the founder has results/saved work, use a small set of clear dashboard tabs for genuinely different layouts and jobs:

- **Opportunities** — discover, review, expand, sort, and save opportunities.
- **Next Steps** — to-dos, full checklists, document gathering, urgency, and progress across saved opportunities. Give this tab a small, restrained footsteps icon that communicates its role.
- **Profile** — confirmed company information and, only after approval, account/settings controls.
- **Help** — simple instructions and FAQ, only after the post-core checkpoint.

Do not add an Overview tab unless it eventually has a unique necessary job. Do not add separate tabs for Current, Forecast, Highest Amount, Nearest Deadline, Saved, or other filtered versions of opportunities.

An opportunity card may still show its single immediate **Next step**. That does not duplicate the Next Steps tab: the card gives one contextual action for that opportunity; the tab aggregates the complete checklist and document work across everything saved.

If the founder opens **Next Steps** before saving anything, show a calm, compact empty state with the footsteps icon and the message: **Save an opportunity to track next steps.** Include one clear action back to Opportunities; do not fill the empty state with extra cards or explanatory copy.

Use the correct control for the correct job:

- **Tabs** switch between fundamentally different layouts/tasks.
- **Filters and sort controls** change which items or ordering appear inside the current layout.
- **Expand/collapse** reveals more detail about the same item without navigating to a different product area.
- **Buttons** perform actions.
- **Links** navigate to a destination.
- **Status labels** communicate state and are not clickable unless they are explicitly a control.
- **Edit icons** edit the adjacent field only.

Do not make tabs behave like filters or filters behave like navigation. Do not put a filtered opportunity view in the tab bar. Keep opportunity filters inside the Opportunities layout and keep them visually separate from the main tabs.

### Saving and the to-do list

Asks if they want to create a profile to save.

- For the core version, save privately to their existing workspace/device without forcing account creation.
- After core is complete, account creation can be one of the optional features Jacob approves.
- The simple core button can say **Save to my list** rather than interrupting the walkthrough with signup.

Click to add to to-do list (to-do list builds in order of relevance (but includes due date). The to-do list tab, when opened, has them “enter” each opportunity where they can see the checklist + docs to gather.

- Make relevance the main order and show the due date/urgency right beside it.
- Each saved opportunity can have one simple state: **Saved**, **Verifying**, **Pursuing**, or **Done**.
- Entering an opportunity should feel like the next part of the same walkthrough, not like opening an admin dashboard.
- The checklist should be opportunity-specific whenever the official notice gives us enough information; otherwise clearly label the generic verification steps.

There should also be a super-list of docs to gather for all the opportunities on the to-do list, but with some way to differentiate which ones are for which.

- Group shared documents once, then show small opportunity labels beside each one.
- Do not invent document requirements. If we have not extracted them from the official notice, say **Check official package**.
- This can wait until the basic saved list and per-opportunity checklist work correctly.

### Only after core is complete and Jacob confirms one

Button to set email schedule before due-date, same pop-up should ask if they want to add due date to calendar as well. Should probably be per opportunity.

Other tabs:

- Profile (can change the business form fields, personal info, login details, delete account, and light/dark/system mode).
- Help (simple steps) + FAQ

Accounts/login, email reminders, calendar integration, full settings/theme/account controls, and Help/FAQ should not be mixed into the core implementation. After core is finished, verified, committed, and pushed, stop and ask Jacob which one to do next, and tell Jacob to check whether Lincoln is awake/available before choosing anything that affects Lincoln's UI branch.

## Final strategic reminder

Do not try to make the entire system look more sophisticated. Make the strongest recommendations more defensible.

The product wins if the founder can answer:

1. What should I pursue?
2. Can my company apply directly?
3. If not, what partner do I need?
4. Why does this fit my actual company and project?
5. What could disqualify me?
6. What evidence supports the recommendation?
7. What should I do next?

That outcome is worth more than adding another adapter, agent, scheduler, or dashboard.

## 2026-08-15 authorized semantic-cap amendment

This amendment records the later product decision to use a hybrid Luna semantic reranker. It supersedes the earlier wording above only where that wording prohibited every model effect on ordering or certainty.

Implemented backend boundary:

- Deterministic code remains authoritative for government facts, eligibility, routing, dates, amounts, provenance, and the raw rubric score.
- After official detail enrichment and deterministic rejection, one consent-gated Luna request reviews every returned recommendation, up to 20.
- Luna returns only `strong`, `partial`, or `weak`, selected company/notice evidence IDs, and controlled mismatch codes. It cannot return prose, scores, facts, dates, or eligibility conclusions.
- `strong` preserves the deterministic result.
- `partial` can only set `effectiveScore` to `min(score.total, 69)` and can change `Pursue now` to `Verify first`.
- `weak` removes the result. Even a weak label must cite at least one valid company evidence ID and one valid official notice evidence ID.
- Invalid output, timeout, missing provider access, redaction failure, or rate-limit failure preserves the complete deterministic result set.
- The public paid-call path is bounded by a 64 KiB request limit plus Cloudflare per-client and regional rate-limit bindings.

Lincoln UI integration remains a separate step. The UI must:

1. Include `externalProcessingConsent: true` in the opportunity-search request only while the existing disclosure checkbox remains checked.
2. Display `match.effectiveScore ?? match.score.total`, never the raw score alone after a semantic cap.
3. Preserve the backend `recommendation.intelligence` object, including its evidence-linked concerns and next action, rather than rebuilding and discarding those fields client-side.
4. Treat top-level `semanticReview` as optional and show deterministic-fallback status when `completed` is false.
5. Keep all new fields additive so the deterministic response continues to work with no consent or provider access.

The test-only response seam is `tests/fixtures/opportunity-search-response-v2.ts`. No Lincoln-owned UI file is changed by the backend-first implementation.
