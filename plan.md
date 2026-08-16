# FundPath Backend Adoption Plan

> **New plan file.** Does not replace `TWO_HOUR_RELEASE_PLAN.md`, `HACKATHON_PLAN.md`, or `AGENTS.md`.  
> **Status:** Proposal — do not implement until this document is explicitly approved.  
> **Source reference:** [juanlizarazo/ai-builder-2026-fundpath](https://github.com/juanlizarazo/ai-builder-2026-fundpath) (FundPath, AI Builder Day 2026 winner).  
> **Target:** Keep our UI + intake + workspace; replace/upgrade the matching brain with FundPath’s deterministic pipeline; run on our existing free-leaning stack with **Luna** instead of Claude.

---

## 1. Goal (two lines)

**Build:** A founder-facing Government Opportunity Map that keeps our current UI and multi-input intake, but uses FundPath’s backend intelligence pattern — structured profile → corpus retrieval → hard eligibility rules → score/sequence/abstain → Luna explanations only.

**Constraint:** No new paid subscriptions (no Firebase Blaze, Anthropic, Twilio, Resend). Stay on Cloudflare + D1 + existing `OPENAI_API_KEY` (Luna).

---

## 2. What stays (ours — do not rip out)

### UI / product surface
- Single-app walkthrough in `opportunity-workbench.tsx` + `resource-dashboard.tsx` + `product-primitives.tsx`
- Civic / Thinking Orbs loading UX, stage rail, provenance display
- Honest search-error vs no-match distinction
- External-source confirmation dialog
- Opportunity-scoped checklist + application prefill workspace (no direct gov submission)

### Intake (we are ahead of FundPath here)
- Website URL, manual description, **and** PDF/DOCX/PPTX upload (`/api/intake/bundle`)
- Founder review screen: show extracted fields, ask only for what is missing / uncertain
- External processing disclosure (restore/enforce consent gate if still soft)
- Luna extraction of evidence → profile field claims (`luna-extraction.ts`)

### Platform
- Next.js + OpenNext on Cloudflare Workers
- D1 `WORKSPACE_DB` + local fallback
- Existing rate limiters
- Five official verifier fixtures + adversarial holdouts (same pipeline, no hard-coded outputs)
- Non-negotiable safety rules in `AGENTS.md`

### AI model
- **Luna (`gpt-5.6-luna`) only** — replaces FundPath’s Claude Haiku for:
  1. Profile / evidence extraction (already ours)
  2. Explanation prose (port FundPath’s four-section prompt pattern)
  3. Optional starter-kit narrative drafts (later phase)
- Luna must **never** set eligibility, tiers, scores, deadlines, amounts, or upgrade a match

---

## 3. What we adopt from FundPath (backend brain)

Port the **intelligence architecture**, not Angular and not Firebase.

### Core pipeline (must port)

```text
Confirmed profile
  → Expansion (industry → NAICS / agency prefixes / keywords)
  → Retrieval over a local corpus (D1), not a free-roaming research agent
  → EligibilityRules (deterministic tier ceilings + flags)
  → Historical proof (USAspending-derived totals/examples)
  → Scoring + ranking
  → Sequencing (primary / alongside / off-route / non-grant over ~12 months)
  → Stacking note (ask vs sum of ceilings)
  → Abstention (zero strong federal stops → honest non-grant path)
  → Luna explanations for kept stops only
  → Persist route-shaped result for UI
```

### Pure TypeScript modules to port first (minimal rewrite)

| FundPath module | Purpose |
|---|---|
| `eligibility.rules.ts` + constants | Hard gates + tier ceilings |
| `tiering.helper.ts` | Tier order / reduce ceilings |
| `scoring.helper.ts` | Weighted fit score |
| `sequencing.helper.ts` | Timeline placements |
| `stacking.helper.ts` | “Not in one award” honesty |
| `abstention.helper.ts` | Case-5-style no-match |
| `expansion.helper.ts` + constants | Profile → search vocabulary |
| `registration-timeline.helper.ts` | SAM/UEI countdown from close date |
| `federal-programs.ts` / `utah-programs.ts` seeds | Curated SBIR + Utah + procurement pathways with provenance |
| Extraction / explanation **prompts** | Retarget to Luna; keep post-validation in TS |

### Thin adapters to rewrite for Cloudflare

| FundPath piece | Our rewrite |
|---|---|
| Firestore `corpus` | D1 tables (`opportunities`, `awards`, `utah_resources`, `corpus_meta`) |
| `RetrievalService` full collection scan | SQL prefilter + in-process score (Workers memory limits) |
| `RouteBuilderService` | `src/lib/route-builder.ts` orchestrator called from `/api/opportunities/search` (or new `/api/route/build`) |
| `ClaudeService` | Luna client (existing OpenAI Responses pattern) |
| `onDocumentCreated` deepPass | Optional `waitUntil` second pass **or** explicit “Check for new” button (no Firebase triggers) |
| Corpus sync schedule | Cloudflare Cron Worker + manual `triggerSync` API |
| `seed/corpus.snapshot.json` (~4MB, ~1561 docs) | One-shot D1 import script (not loaded per request) |

### Do **not** port as dependencies
- Angular frontend
- Firebase Auth / Hosting / Functions / Storage
- Anthropic SDK
- Twilio SMS / WhatsApp
- Resend email (defer; free tier later if needed)
- Disk LLM cache
- `minInstances: 1` warm functions (that is what costs money on Firebase)

---

## 4. Free-stack mapping

| FundPath paid/heavy | Our free-leaning substitute | Notes |
|---|---|---|
| Firebase Blaze + warm Functions | Cloudflare Workers (already deployed) | Stay on current plan |
| Firestore | D1 `WORKSPACE_DB` + new corpus tables | May need second D1 or same DB with migrations — decide in Phase 0 |
| Claude Haiku | Luna via existing `OPENAI_API_KEY` | Only cost is OpenAI usage you already have |
| Twilio SMS | **Out of scope** for this plan | Feature idea kept as “later / free channel TBD” |
| Resend email | **Out of scope** for this plan | Same |
| Firebase Storage (SF-424 PDF) | Cloudflare R2 free tier **or** return PDF bytes to browser | Only if SF-424 phase is approved |
| Gov APIs | Same free public APIs | Grants.gov, USAspending; SBIR may 403 → seeds |

**Money reality:** “Free” means no new SaaS. Luna/OpenAI still meters tokens. Prefer Haiku-equivalent prompt sizes; batch explanations; template fallback when Luna is down (already our pattern).

---

## 5. Feature merge matrix

### Keep ours (FundPath weaker or missing)
- Multi-source intake (file / URL / text)
- Founder field-by-field confirmation UX
- Semantic review as **downgrade-only** (optional second Luna pass)
- Opaque workspace credentials + D1 persistence
- Explicit search-failure UI
- Source role separation already in adapters

### Add from FundPath (we are missing or weaker)
| Feature | Why it matters | Phase |
|---|---|---|
| Sequenced **route timeline** (primary stops over months) | Turns a list into a plan | 3–4 |
| **Alongside** state/counseling/procurement stops | Utah-specific value | 3 |
| **Off-route** with reasons | Trust / honesty | 3 |
| **Non-grant alternatives** on abstention | Case 5 / consumer honesty | 2–3 |
| **Stacking note** | “$2M ask ≠ one award” | 2 |
| Richer **historical proof** (totals, median, named winners) | Defensibility | 2 |
| **Utah “who to call”** directory match | Actionability | 3 |
| **Registration timeline** (SAM backwards from deadline) | Apply kit differentiator | 4 |
| Curated **procurement pathways** (GSA, DIU CSO, Phase III, OTA) | Beyond grants-only | 2 (seeds) |
| Application **starter kit** + optional SF-424 fill | Workspace upgrade | 4 |
| Deepen / “check for new” second pass | Freshness without fake agents | 5 (optional) |

### Explicitly defer (cost, P0, or AGENTS extras)
- SMS / WhatsApp / email digests
- OAuth / Google account linking
- Public share links as a product (we already have workspace tokens)
- Print-to-PDF chrome (nice-to-have)
- Live research-agent fan-out to gov APIs per request (**rejected** — see §7)

---

## 6. Target architecture (after adoption)

```text
[Our UI]
  intake (file/URL/text) → Luna extract → founder confirm
        ↓
[API] POST /api/opportunities/search  (or /api/route/build)
        ↓
[Ported FundPath brain on Cloudflare]
  expand → retrieve(D1 corpus) → eligibility → historical
  → score → sequence → stack → abstain
  → Luna explain (prose only)
        ↓
[Response shaped for our UI]
  recommendations + route timeline + off-route + non-grant
  + stacking note + utah resources + provenance
        ↓
[Our workspace]
  checklist / prefill / D1 save
```

### Suggested new library layout (names illustrative)

```text
src/lib/fundpath-brain/
  eligibility.*
  scoring.*
  tiering.*
  sequencing.*
  stacking.*
  abstention.*
  expansion.*
  retrieval.ts          # D1-backed
  historical.ts
  resources.ts
  route-builder.ts      # orchestrator
  explanation-luna.ts   # prose only
  registration-timeline.ts

src/lib/corpus/
  schema migrations
  sync-grants.ts
  sync-usaspending.ts
  seed-federal.ts
  seed-utah.ts
  import-snapshot.ts
```

Existing `opportunity-matching.ts` / `opportunity-discovery.ts` either:
- **A (preferred):** become thin wrappers that call `route-builder`, or
- **B:** get replaced after fixtures prove parity on the five cases.

Do not run two conflicting brains in production.

---

## 7. Planning corrections (so we don’t rebuild theater)

| Idea | Verdict |
|---|---|
| Profile JSON / structured fields | **Keep** — correct |
| Multi-input + confirm missing fields | **Keep** — better than FundPath |
| Research agent with 3–5 sub-agents hitting live APIs | **Do not build as core** — flaky, costly, hard to keep honest |
| “Must take ≥10 seconds” | **No** — show real progress; FundPath takes ~30–40s when work is real |
| Luna decides eligibility | **Forbidden** (ours + FundPath) |
| Pre-built corpus + deterministic rules | **Adopt** — this is their winning backend shape |

---

## 8. Phased execution plan

Spend planning time **before** coding each phase. Between phases: write a short `context-phase-N.md` (done / next / risks). Before an agent starts a phase: require a **2-line** restatement of what it will build.

### Phase 0 — Agreement & inventory (no product code)
- Approve this plan vs `AGENTS.md` “no new architecture without agreement”
- Inventory D1 capacity; decide corpus tables in existing DB vs new binding
- License/check: porting TypeScript logic inspired by a public hackathon repo (attribution in README)
- Freeze: UI shell stays; no Angular

**Exit:** Written yes/no on scope; D1 schema sketch

### Phase 1 — Corpus spine (parallelizable with Phase 2 scaffolding)
- D1 migrations: opportunities, awards, utah_resources, corpus_meta
- Import FundPath `corpus.snapshot.json` (timestamp conversion)
- Seed federal + Utah curated programs with provenance
- Manual sync scripts for Grants.gov + USAspending (cron later)
- Read-only corpus health endpoint for operators

**Exit:** D1 has ≥ posted/forecasted opportunities; seed programs present; import reproducible

### Phase 2 — Deterministic brain (the FundPath core)
- Port eligibility / scoring / tiering / sequencing / stacking / abstention / expansion
- Wire `route-builder` behind search API using **confirmed** `CompanyProfile` (map our fields ↔ their `IStartupProfile`)
- Historical helper over D1 awards
- Unit tests ported/adapted (especially Case 5 abstention + municipal-prime warn)
- Run five official fixtures through new brain; no profile-specific hardcodes

**Exit:** Five fixtures produce defensible routes; consumer abstains with non-grant alts; Luna unused for tiers

### Phase 3 — UI mapping (keep our design language)
- Map route-builder output into workbench / dashboard without a full redesign
- Show: verdict line, primary timeline, alongside, off-route reasons, non-grant alts, stacking note, historical proof, Utah contacts
- Preserve Thinking Orbs / professional loading for extract + build
- Keep error vs empty-match paths

**Exit:** Browser walkthrough of healthcare + consumer cases on staging

### Phase 4 — Application depth (FundPath apply kit, our workspace)
- Registration timeline helper into workspace / per-opportunity panel
- Starter-kit document checklist + deterministic portal hints
- Optional: SF-424 PDF fill via `pdf-lib` + browser download or R2 (no Firebase)
- Luna only for narrative *drafts*, clearly labeled as drafts

**Exit:** One opportunity → actionable timeline + checklist; SF-424 optional stretch

### Phase 5 — Sync & deepen (optional)
- Cloudflare Cron corpus sync
- Optional second-pass deepen (`waitUntil` or button) — not a multi-agent research swarm
- Still no SMS/email unless free path is approved separately

**Exit:** Corpus freshness story without paid messaging

### Parallelism (after Phase 0)
| Track A | Track B |
|---|---|
| Corpus import + sync scripts | Pure TS rules port + tests |
| D1 schema | Profile field mapping |
| Later: cron | Later: UI route presentation |

One agent builds; a second fixes bugs — same as FundPath’s operating style.

---

## 9. Profile mapping (ours → brain)

Our confirmed profile already has the right *idea* (structured JSON). Map carefully:

| Our field (approx) | Brain needs |
|---|---|
| description / researchActivities / technology | keywords, `hasRdCore` |
| industry | vertical slug → NAICS / agencies |
| location | Utah/geography filters |
| employees | SBIR size rule |
| capitalNeed / revenue / capitalRaised | ask band, commercial framing |
| applicantType / ownership / usEntityStatus | eligibility flags |
| samStatus / uei | registration timeline / info flags |
| useOfFunds / productStage | sequencing / non-grant hints |

Luna extraction stays on intake. The brain consumes **founder-confirmed** values, not raw model guesses, whenever the UI has collected confirmation.

---

## 10. Safety & regression gates

Must remain true after adoption:
1. Same pipeline for all five official profiles — no hard-coded outputs
2. Government facts carry source id, URL, retrieval time (or curated provenance block)
3. Luna never creates/upgrades eligibility, scores, dates, amounts
4. Unknown critical eligibility caps at Potential Fit / equivalent tier
5. Current opportunities ≠ historical awards
6. Search failure ≠ honest no-match
7. Unsupported application fields stay blank → founder questions
8. No direct government form submission
9. No secrets in client / prompts / logs / commits
10. Existing matching regression fixtures (manufacturing false positives) still pass or are re-expressed against the new brain

---

## 11. What “done” looks like

**P0 done when:**
- Our UI intake (file/URL/text) → confirm → FundPath-style route result
- Deterministic eligibility/sequencing/abstention live on Cloudflare
- Luna used only for extract + explain
- Five fixtures + consumer abstention verified
- No new paid SaaS wired

**Nice-to-have after:**
- Starter kit + registration timeline + SF-424 download
- Cron sync + deepen pass
- Messaging (only if free)

---

## 12. Rollback

- Feature-flag `USE_FUNDPATH_BRAIN` (or route-level switch) default off until Phase 2 exit criteria pass
- Keep previous `opportunity-matching.ts` path callable until flag removal
- D1 corpus migrations are additive; dropping the flag returns list-style recommendations without timeline fields

---

## 13. Open decisions (need your call before code)

1. **Replace** current matching brain entirely, or run FundPath brain behind a flag until parity?
2. Corpus in **existing** `WORKSPACE_DB` vs **new** D1 database?
3. Is Phase 4 SF-424 in scope for the next build, or stop at timeline + checklist?
4. Utah-only resource directory vs national-neutral copy when location ≠ Utah?
5. Attribution line in README for FundPath / AI Builder Day inspiration — yes/no?

---

## 14. Immediate next step

Reply with approval (and answers to §13). Then start **Phase 0 + Phase 1** only — no UI redesign, no SMS, no Firebase, no Anthropic.
