# FundPath Backend Adoption Plan

> **Baseline:** `post-hackathon-v2` (PR [#9](https://github.com/bigtoken-cmd/government-opportunity-map/pull/9)), not `main` and not the deleted two-hour / hackathon plan files.  
> **Authority on that branch:** `AGENTS.md` + `src/lib/agents/*` stage instructions.  
> **Status:** Proposal — do not implement until explicitly approved.  
> **Source reference:** [juanlizarazo/ai-builder-2026-fundpath](https://github.com/juanlizarazo/ai-builder-2026-fundpath).  
> **This file does not replace V2.** It proposes the next architecture move *after / alongside* Stage A.

---

## 1. Goal (two lines)

**Build:** Keep post-hackathon V2’s UI, multi-input intake, listing enrichment, and Cloudflare hosting — but upgrade the middle of search with FundPath’s deterministic route brain (eligibility → score → sequence → abstain → stacking), using **Luna** for extract/explain only.

**Constraint:** No new paid SaaS (no Firebase, Anthropic, Twilio, Resend). Stay on Cloudflare Workers + D1 + existing `OPENAI_API_KEY` (Luna).

---

## 2. Current baseline (what V2 already is)

Branch tip: `origin/post-hackathon-v2` @ Stage A.

### Already shipped / in PR #9
- Old plan files **deleted** (`TWO_HOUR_RELEASE_PLAN.md`, `HACKATHON_PLAN.md`, Jacob handoffs)
- `AGENTS.md` rewritten around model stage files in `src/lib/agents/`
- Intake: website **or** file (incl. drag-and-drop) **or** pasted notes
- Textarea is **evidence**, not the company description dump
- Luna extraction with claim kinds: `verbatim` / `inferred` / `summarized`
- Thinking orb on profile build + search
- Follow-ups = only remaining empty **required** fields (max 7)
- Search: **rank first**, then enrich only returned cards (Worker 60s budget)
- Listing scrape: Grants.gov HTML Similar Opportunities + How-to-Apply
- Deterministic listing-aware prefill rows (editable in workspace)
- Luna semantic review: **downgrade/remove only**
- Same safety bar: models never own eligibility, scores, deadlines, historical totals

### V2 roadmap already named (do not invent a parallel product track)
| Stage | Scope |
|---|---|
| **A** (this PR) | Intake + returned-set enrichment + research pass shell |
| **B** | ALN/SBIR cron stores, show-more/metadata polish, wording pass, water/Title XVI regressions |
| **C** | Google OAuth |
| **D** | SAM procurement, attachments, notice tasks, funding roadmap, then email/calendar/settings/help one-at-a-time |

This FundPath adoption plan **slots primarily into the matching/intelligence layer** and into **Stage B corpus work**. It must not reopen deleted hackathon docs or fight Stage A UI.

---

## 3. What we keep from V2 (do not rip out)

### UI
- `opportunity-workbench.tsx` — intake → review → search → results → workspace
- `resource-dashboard.tsx` — cards, show more, next steps, profile tab
- `product-primitives.tsx`, Thinking Orb, civic styling
- Honest search-error vs no-match; external-source confirmation

### Intake (ahead of FundPath)
- Multi-input bundle API
- Inferred / summarized tagging
- Max-7 remaining-field follow-ups
- Description never filled by dumping the upload

### Platform & safety
- Cloudflare Workers + OpenNext + `wrangler.jsonc` rate limits
- D1 workspace persistence + local fallback
- `src/lib/agents/*` instruction files as the model-policy home
- Five-profile / adversarial fixtures: same pipeline, no hard-coded outputs

### Post-rank enrichment (keep as a shell)
- `listing-page.ts`, `listing-prefill.ts`, `opportunity-research-agent.ts`
- Rank-before-enrich Grants.gov detail fetch
- Research agents may **retrieve / extract / propose** only — never upgrade Skip → Pursue

### AI model
- **Luna (`gpt-5.6-luna`) only**
  1. Intake extraction (already V2)
  2. Optional semantic downgrade (already V2)
  3. FundPath-style explanation prose (new — four sections)
  4. Later: starter-kit narrative drafts / Stage B wording pass
- Never: eligibility, tiers, scores, deadlines, amounts, upgrades

---

## 4. What we adopt from FundPath (backend brain)

Port the **intelligence architecture**, not Angular and not Firebase.

### Target middle of the V2 search pipeline

```text
V2 today:
  profile → buildSearchQueries → Grants/ALN/USA/SBIR adapters
       → discover + match/score → semantic review → listing research pass → UI

V2 + FundPath brain:
  profile → Expansion (NAICS/agency/keywords)
       → Retrieval over D1 corpus (+ live Grants merge as needed)
       → EligibilityRules → Historical proof → Score → Sequence
       → Stack → Abstain
       → Luna explain (prose only)
       → KEEP V2 listing scrape + prefill on returned stops
       → UI gains timeline / alongside / off-route / non-grant / stacking
```

### Pure TS modules to port first

| FundPath module | Purpose in our app |
|---|---|
| `eligibility.rules.ts` + constants | Hard gates + tier ceilings |
| `tiering.helper.ts` | Tier order / reduce ceilings |
| `scoring.helper.ts` | Weighted fit score |
| `sequencing.helper.ts` | primary / alongside / off-route / non-grant |
| `stacking.helper.ts` | Ask vs sum of award ceilings |
| `abstention.helper.ts` | Honest zero-federal + non-grant path |
| `expansion.helper.ts` + constants | Profile → retrieval vocabulary |
| `registration-timeline.helper.ts` | SAM/UEI countdown from close date |
| Federal + Utah curated seeds (w/ provenance) | SBIR/procurement/state fallback when APIs fail |
| Explanation prompts | Retarget to Luna; keep validation in TS |

### Rewrite for Cloudflare (no paid Firebase)

| FundPath piece | Our substitute |
|---|---|
| Firestore `corpus` | D1 tables (`opportunities`, `awards`, `utah_resources`, `corpus_meta`) — aligns with V2 Stage B cron stores |
| Full-collection retrieval | SQL prefilter + in-process score (Worker memory) |
| `RouteBuilderService` | `src/lib/fundpath-brain/route-builder.ts` called from `opportunity-search.ts` |
| `ClaudeService` | Existing Luna Responses client pattern |
| Firestore deepPass trigger | Optional `waitUntil` or explicit “Check for new” — no Firebase |
| `corpus.snapshot.json` (~4MB) | One-shot D1 import script |
| Twilio / Resend / Firebase Auth | **Out of scope** (V2 Stage C/D already owns OAuth/email later) |

### Do not port
- Angular UI
- Firebase Hosting/Functions/Auth/Storage
- Anthropic SDK
- SMS/WhatsApp
- Paying to keep warm function instances

---

## 5. Free-stack mapping

| Costly FundPath piece | Our path |
|---|---|
| Firebase Blaze + `minInstances: 1` | Cloudflare Workers (already) |
| Firestore | D1 (extend existing or add corpus DB — decide in §13) |
| Claude Haiku | Luna via current `OPENAI_API_KEY` |
| Twilio / Resend | Defer to V2 Stage D; no new subscriptions now |
| SF-424 Storage | Browser download or R2 free tier if Phase F approved |

Luna still costs tokens. Prefer short prompts, batch explanations, deterministic template fallback when Luna is down (V2 already fail-closed in places).

---

## 6. Feature merge (V2 × FundPath)

### Keep V2 (FundPath weaker)
- File / URL / notes intake + claim tags + max-7 follow-ups
- Rank-first Worker budget discipline
- Listing Similar Opportunities scrape
- Editable listing prefill in workspace
- Downgrade-only semantic review
- Stage roadmap B→D already decided

### Add from FundPath (V2 missing or thinner)
| Feature | Fits where | Phase |
|---|---|---|
| Sequenced route timeline | Results + workspace | E |
| Alongside state/counseling/procurement stops | Results | E |
| Off-route with reasons | Results | E |
| Non-grant alternatives on abstention | Results (esp. consumer) | D-brain / E |
| Stacking note | Results header | D-brain |
| Richer historical proof (totals/median/named winners) | Card + workspace | D-brain |
| Utah “who to call” directory | Next-steps panel | E |
| Registration timeline (SAM backwards) | Workspace / apply kit | F |
| Curated procurement pathways | Corpus seeds | C-corpus |
| Starter kit + optional SF-424 | Workspace | F |

### Explicitly reject / defer
- Free-roaming multi-agent “research swarm” as the matcher (V2 policies already say retrieve/propose only; FundPath matches that)
- Padding UX to “at least 10 seconds”
- SMS / email digests before Stage D
- Reintroducing deleted `TWO_HOUR_*` / `HACKATHON_PLAN.md` as authority

---

## 7. What to replace vs preserve in code

### Preserve
- `AGENTS.md`, `src/lib/agents/**`
- `opportunity-workbench.tsx`, `resource-dashboard.tsx`, `product-primitives.tsx`
- `src/lib/intake/**`, intake APIs
- `listing-page.ts`, `listing-prefill.ts`, `opportunity-research-agent.ts`
- `persistence/**`, workspace migrations
- `sources/grants.ts`, `usaspending.ts`, `source-contracts.ts` (wrap/extend)
- Deploy / wrangler / rate limits / fixture safety tests

### Replace or heavily reshape (FundPath brain)
- `opportunity-matching.ts` — eligibility + score + decisions
- `opportunity-intelligence.ts` — route/sequencing/stacking/explanations
- `concept-normalization.ts` + `buildSearchQueries` — lean on Expansion + corpus retrieval
- Ranking core inside `opportunity-discovery.ts`
- Parts of `opportunity-search.ts` orchestration (keep rank-before-enrich + research pass shell)
- Reassess `opportunity-semantic-review.ts` as optional post-filter once FundPath tiers exist

### Suggested new tree
```text
src/lib/fundpath-brain/
  eligibility.*  scoring.*  tiering.*  sequencing.*
  stacking.*  abstention.*  expansion.*
  retrieval.ts  historical.ts  resources.ts
  route-builder.ts  explanation-luna.ts
  registration-timeline.ts

src/lib/corpus/
  migrations + sync-grants.ts + sync-usaspending.ts
  seed-federal.ts + seed-utah.ts + import-snapshot.ts
```

Feature-flag: `USE_FUNDPATH_BRAIN` until five fixtures pass.

---

## 8. Planning corrections (still true on V2)

| Idea | Verdict |
|---|---|
| Structured profile + confirm missing fields | **Keep** — V2 already does this well |
| Multi-input intake | **Keep** — better than FundPath |
| Research agent as free matcher with 3–5 sub-agents | **Do not** — V2 correctly bounds research; FundPath uses corpus + rules |
| Luna decides eligibility | **Forbidden** |
| Pre-built corpus + deterministic rules | **Adopt** — this is the FundPath win; aligns with V2 Stage B stores |

---

## 9. Phased execution (relative to V2 stages)

Work on top of **`post-hackathon-v2`** (merge or branch from it — not from stale `main` docs). Between phases: short context note (done / next / risks). Before an agent starts: **2-line** restatement of what it will build.

### Phase 0 — Agreement
- Confirm this plan vs V2 `AGENTS.md`
- Decide: land after PR #9 merges, or stack on `post-hackathon-v2` now
- Answer §13 open decisions
- Attribution note for FundPath inspiration (README)

**Exit:** Written approval + branch strategy

### Phase A — Stay out of the way of PR #9
- Do not regress Stage A intake/orb/listing/prefill
- No UI redesign while Stage A is landing

**Exit:** PR #9 merged or explicitly used as base

### Phase B-corpus — Corpus spine (pairs with V2 Stage B)
- D1 migrations for opportunities / awards / utah_resources / corpus_meta
- Import FundPath snapshot (timestamp conversion)
- Seed federal + Utah curated programs with provenance
- Manual sync scripts; cron later (V2 Stage B)

**Exit:** Reproducible corpus; health check endpoint

### Phase C-brain — Deterministic FundPath core
- Port eligibility / scoring / tiering / sequencing / stacking / abstention / expansion
- Map V2 confirmed profile → brain profile fields
- Wire `route-builder` behind search under feature flag
- Port/adapt unit tests; Case-5-style abstention + municipal-prime warn
- Run five official fixtures + adversarial holdouts

**Exit:** Flag-on search returns sequenced routes; Luna unused for tiers; fixtures green

### Phase D-explain — Luna explanations + historical density
- Four-section explanation prompts via Luna (fallback templates)
- Historical helper over D1 awards on primary stops
- Keep V2 listing research pass on returned stops

**Exit:** Cards show why-fit / ineligible / verify / next + proof blocks

### Phase E-ui — Present the route without redesigning the product
- Map brain output into workbench/dashboard: verdict, timeline, alongside, off-route, non-grant, stacking, Utah contacts
- Preserve orb + civic language
- Preserve error vs empty-match

**Exit:** Browser pass: healthcare route + consumer abstention on staging

### Phase F-apply — Application depth (optional stretch)
- Registration timeline into workspace
- Starter-kit checklist + portal hints
- Optional SF-424 via `pdf-lib` + browser/R2 download
- Luna narrative drafts labeled as drafts only

**Exit:** One stop → actionable timeline + checklist

### Phase G — Align with V2 C/D (later, separate approvals)
- OAuth (V2 C), messaging/settings/help (V2 D) — **not** part of FundPath port
- Procurement SAM beyond curated seeds — only when Stage D starts

### Parallelism after Phase 0 / A
| Track 1 | Track 2 |
|---|---|
| Corpus import + sync | Pure TS rules + tests |
| D1 schema | Profile field mapping |
| Later: cron | Later: UI route presentation |

One agent builds; a second bugfixes.

---

## 10. Profile mapping (V2 confirmed → brain)

| V2 field / tag | Brain use |
|---|---|
| `summarized` description | Expansion keywords; never raw evidence dump |
| industry / technology / researchActivities | vertical, NAICS, `hasRdCore` |
| location | geography / Utah resources |
| employees | SBIR size |
| capitalNeed / capitalRaised / revenue (`inferred` ok if founder-confirmed) | ask band |
| applicantType / ownership / usEntityStatus | eligibility flags |
| samStatus / uei | registration timeline |
| useOfFunds / productStage | sequencing / non-grant hints |

Prefer **founder-confirmed** values at search time. Keep `inferred` / `summarized` visible in UI.

---

## 11. Safety & regression gates

Must remain true:
1. Same pipeline for all official profiles — no hard-coded outputs  
2. Official facts carry source id, URL, retrieval time (or curated provenance)  
3. Luna/research never create/upgrade eligibility, scores, dates, amounts  
4. Unknown critical eligibility → Potential Fit (or FundPath equivalent cap)  
5. Current opportunities ≠ historical awards  
6. Search failure ≠ honest no-match  
7. Unsupported application fields stay blank  
8. No direct government form submission  
9. No secrets in client / prompts / logs / commits  
10. Manufacturing false-positive regressions still hold or are re-expressed against the new brain  
11. V2 Stage A intake/listing behavior does not regress  

---

## 12. Done looks like

**Core done when:**
- V2 UI intake → confirm → FundPath-style sequenced route on Cloudflare
- Deterministic eligibility / sequencing / abstention live
- Luna only extract / downgrade / explain
- Five fixtures + consumer abstention verified
- Listing scrape + prefill still run on returned stops
- No new paid SaaS

**Stretch:** registration timeline, starter kit, SF-424 download  

**Not this plan:** OAuth, SMS, email digests, settings, help chat

---

## 13. Open decisions (answer before code)

1. Base implementation branch: wait for PR #9 merge to `main`, or branch from `post-hackathon-v2` now?  
2. Replace matching behind `USE_FUNDPATH_BRAIN` until parity, or cut over immediately after fixtures?  
3. Corpus tables in existing `WORKSPACE_DB` vs new D1 database?  
4. Is Phase F (SF-424) in the next build, or stop after timeline + checklist?  
5. Utah-only “who to call” vs neutral copy when location ≠ Utah?  
6. README attribution to FundPath / AI Builder Day — yes/no?  

---

## 14. Immediate next step

Approve this plan (and answer §13). Then:
1. Ensure work bases on **`post-hackathon-v2` / merged Stage A**  
2. Start **Phase B-corpus + Phase C-brain** only  
3. Do not resurrect `TWO_HOUR_RELEASE_PLAN.md` or treat it as authority  

---

## 15. Rollback

- Feature-flag off → previous V2 matching path  
- Additive D1 corpus migrations  
- UI timeline fields optional until flag on  
