# Government Opportunity Map — Jacob / Pro Backend Intelligence Handoff

> Copy this entire document into a new ChatGPT Pro/Codex chat opened on the repository at `/Users/lincolnberbert/Projects/government-opportunity-map-main`.

## Your role and authority

You are taking over the intensive backend and intelligence work for a time-constrained hackathon submission. Work directly in the repository, inspect the current implementation before changing it, preserve unrelated work, and verify changes proportionally to risk.

The repository's old ownership split is now stale for this work. The user has explicitly reversed it because Jacob has the ChatGPT Pro subscription and Lincoln has exhausted Cursor usage.

Use this ownership split:

- **Jacob + this Pro chat:** source retrieval, notice enrichment, canonical contracts, founder-profile normalization, eligibility, ranking, historical joins, result explanations, backend/API work, backend tests, and final integration/merges.
- **Lincoln + his Plus chat:** UI polish, visual hierarchy, responsive presentation, client components, and browser QA.
- **Shared seam:** the search-response contract. Keep it stable and additive so Lincoln can build UI against a fixture while backend work proceeds.
- Avoid editing `src/app/components/opportunity-workbench.tsx` and `src/app/globals.css` during backend work unless there is a very small, explicitly coordinated final integration step.
- Do not deploy, change Cloudflare resources, add packages, or modify secrets without explicit user authorization.

The old ownership section in `AGENTS.md` should not be treated as the current personnel assignment. Its product-safety rules still apply unless this handoff explicitly narrows or clarifies them.

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

## Important URLs and local paths

- Repository: `/Users/lincolnberbert/Projects/government-opportunity-map-main`
- Current deployed build: `https://government-opportunity-map.bigtoken.workers.dev/`
- Bounty brief: `https://startupstate-hackathon-brief.lovable.app/`
- Previous JobNimbus-winning repository examined for comparison: `https://github.com/gobixplr-svg/aibuilderday-2026`
- Authoritative plan: `/Users/lincolnberbert/Projects/government-opportunity-map-main/HACKATHON_PLAN.md`
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

## Recommended backend implementation order

Use the remaining time for depth, not horizontal expansion.

### Phase 1 — Freeze the seam

1. Inspect the current git branch/status and all applicable repository rules.
2. Inspect tests and the current search response.
3. Define the smallest additive recommendation-intelligence contract.
4. Create a realistic fixture Lincoln can use during UI work.
5. Avoid touching the actual workbench while Lincoln is modifying it.

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

The current suite proves that the pipeline runs and honors safety boundaries. Add a human-meaningful result-quality gate.

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
- Alerts, email, or calendar integrations
- OAuth/settings/help surfaces
- Deep application-assistant automation
- RAG, embeddings, autonomous agents, or a vector database
- A comprehensive similar-company engine
- Direct government-form submission
- More persistence polish
- Decorative AI features

The highest-value slice is:

> Better profile facts + official notice enrichment + deterministic route classification + specific evidence mappings + precise next actions + compact historical support.

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

1. Read `AGENTS.md`, `HACKATHON_PLAN.md`, `README.md`, the current source contracts, search/matching/intake code, and relevant tests completely enough to understand the actual implementation.
2. Inspect `git status`, branches, and recent commits. Preserve all existing user work.
3. Treat the ownership split in this document as the user's latest instruction.
4. Produce a compact implementation plan with at most one step in progress.
5. Establish the additive response contract and a UI fixture first.
6. Work only on the backend/intelligence side until the integration pass.
7. Use official primary government sources for government facts. Browse official docs if an API/detail endpoint must be verified.
8. Implement the smallest coherent intelligence loop before optional enhancements.
9. Run focused tests after each risky layer, then the full suite, lint, TypeScript, build, and `git diff --check` when appropriate.
10. Do not claim live/deployment/browser verification that was not actually performed.
11. Do not commit, push, open a PR, deploy, or modify external resources unless the user asks.
12. At handoff, list changed files, tests run, known limitations, response-contract changes, and the one small integration task Lincoln's UI branch needs.

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
