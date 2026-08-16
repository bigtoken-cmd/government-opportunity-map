# FundPath Backend Adoption Plan

> **Baseline:** `post-hackathon-v2` (PR [#9](https://github.com/bigtoken-cmd/government-opportunity-map/pull/9)).  
> **Authority:** `AGENTS.md` + `src/lib/agents/*` (hackathon / two-hour plan files are deleted and stay deleted).  
> **Status:** Decisions in §13 are **locked** (2026-08-16). Implementation proceeds phase by phase on `post-hackathon-v2`.  
> **Source reference:** [juanlizarazo/ai-builder-2026-fundpath](https://github.com/juanlizarazo/ai-builder-2026-fundpath) — attribute in README; he cleared a fork even though the repo is not MIT-licensed.  
> **Product goal:** Behave like FundPath’s product (deterministic route brain + corpus + explanations + apply depth), with **our better V2 UI/intake**, any V2 features FundPath lacked, and **free/Cloudflare substitutes** for his paid services. Luna replaces Claude.

---

## 1. Goal (two lines)

**Build:** FundPath-equivalent backend intelligence on our stack — structured profile → corpus → hard eligibility → score/sequence/abstain/stack → Luna explanations — behind our V2 UI.

**Constraint:** No Firebase / Anthropic / Twilio / Resend. Cloudflare Workers + dedicated corpus D1 + existing `OPENAI_API_KEY` (Luna).

---

## 2. Locked decisions (plain English)

| # | Decision | Meaning |
|---|---|---|
| 1 | **Work on `post-hackathon-v2`** | All FundPath-port work happens on this branch. If GitHub/PR mechanics block that, merge V2 + plan branches and continue. Do not treat `main`’s old docs as authority. |
| 2 | **Full FundPath-like behavior** | End state is not “two matchers forever.” The app should *work like FundPath* (route timeline, eligibility rules, abstention, stacking, corpus, explain, apply kit). A temporary engineering flag during the port is OK only to avoid breaking demos mid-migration; remove it when fixtures pass. |
| 3 | **Dedicated corpus database** | Closest to FundPath’s separate Firestore `corpus` collection: a **new D1 database** for opportunities/awards/seeds/resources, separate from workspace user docs. |
| 4 | **Phase by phase, including SF-424** | Do not cut SF-424 from the roadmap. Finish earlier phases first; SF-424/starter-kit comes when we reach that phase. |
| 5 | **Federal nationwide; Utah is flavor** | Matching searches **federal** opportunities for any US company. Utah “who to call” / state programs are GOED-oriented extras: emphasize when the company is in Utah; for non-Utah companies still run full federal matching and don’t fake Utah-only eligibility. |
| 6 | **Attribution: yes** | README credits FundPath / Juan / AI Builder Day; note fork permission. |

### What decision #2 was asking (so it’s not confusing)

Earlier draft offered: (a) keep old matcher behind a switch until the new one is proven, or (b) delete the old matcher the day fixtures pass.

**Your intent:** the product should become FundPath-like. So we port until behavior matches, prove it on the five fixtures, then the FundPath-style brain **is** the matcher. We are not permanently running “V2 list mode” and “FundPath mode” as two products.

### What decision #3 was asking

FundPath kept program data in a big **corpus** store, and user paths in other collections. On Cloudflare we can dump corpus tables into the same D1 as workspaces, or give corpus its own D1.

**Your intent:** closest to FundPath → **own corpus D1** (name e.g. `CORPUS_DB` / `government-opportunity-map-corpus`).

---

## 3. Current V2 baseline (keep)

### Already on this branch (Stage A)
- Multi-input intake: website / file (drag-drop) / notes
- Evidence ≠ dumped description; Luna `verbatim` / `inferred` / `summarized`
- Thinking orb; max 7 remaining required follow-ups
- Rank-first search (Worker 60s); listing scrape + Similar Opportunities; deterministic prefill
- Luna semantic review: downgrade/remove only
- Safety: models never own eligibility, scores, deadlines, historical totals

### V2 stages already named
| Stage | Scope |
|---|---|
| **A** | Intake + returned-set enrichment + research pass shell (PR #9) |
| **B** | ALN/SBIR cron stores, card polish, wording pass, regressions |
| **C** | Google OAuth |
| **D** | SAM procurement, attachments, notice tasks, funding roadmap, then email/calendar/settings/help |

FundPath port **fills the matching brain** and **feeds Stage B corpus**. It must not reopen deleted plan files or regress Stage A UI.

---

## 4. What “like FundPath” means here

### Must feel like FundPath
- One confirmed company profile in → a **route** out (sequenced stops, not only a flat card list)
- Deterministic eligibility tiers + flags (LLM does not pick the tier)
- Alongside / off-route / non-grant alternatives + abstention when nothing honest fits
- Stacking note when one award can’t cover the ask
- Historical proof from award data (totals/examples), not invented
- Explanations in fixed sections written by Luna from decisions already made
- Registration timeline + starter kit + SF-424 fill (later phases)
- Curated federal/Utah seeds with provenance when live APIs fail (e.g. SBIR 403)

### Must stay better than FundPath (ours)
- File / URL / notes intake + claim tags + confirm-missing-fields
- Rank-first Worker discipline + listing scrape/prefill
- Civic UI / orb / honest error vs no-match
- Cloudflare free-leaning hosting instead of Firebase Blaze warm instances

### Free substitutes for his paid stack
| FundPath | Ours |
|---|---|
| Firebase + warm Functions | Cloudflare Workers |
| Firestore corpus | **New D1 `CORPUS_DB`** |
| Claude Haiku | Luna (`gpt-5.6-luna`) |
| Twilio / Resend | Skip until V2 Stage D; not required for FundPath-like core |
| Firebase Auth | Anonymous/session as today; OAuth = V2 Stage C |
| Firebase Storage SF-424 | Browser download or R2 free tier when we hit that phase |

---

## 5. Architecture target

```text
[V2 UI]
  intake → Luna extract → founder confirm (max 7 gaps)
        ↓
[Search API]
  Expansion → Retrieve(CORPUS_DB + live Grants as needed)
  → Eligibility → Historical → Score → Sequence → Stack → Abstain
  → Luna explain (prose only)
  → V2 listing scrape + prefill on returned stops
        ↓
[UI]
  verdict + timeline + alongside + off-route + non-grant
  + stacking + historical + Utah contacts (when relevant)
  + workspace checklist / prefill / later SF-424
```

### New library layout
```text
src/lib/fundpath-brain/     # ported pure TS + Luna explain
src/lib/corpus/             # D1 CORPUS_DB access, sync, seeds, snapshot import
```

### Wrangler
- Keep `WORKSPACE_DB` for workspaces
- Add `CORPUS_DB` binding → new D1 database (FundPath-like separation)

### Temporary flag
- `USE_FUNDPATH_BRAIN` allowed **only during port** so Stage A demos don’t break mid-PR
- Remove after five fixtures + consumer abstention pass on the new brain
- Final product: one brain, FundPath-like

---

## 6. Preserve vs replace

### Preserve
- `AGENTS.md`, `src/lib/agents/**`
- Workbench / dashboard / primitives / orb
- `src/lib/intake/**`
- `listing-page.ts`, `listing-prefill.ts`, `opportunity-research-agent.ts`
- Workspace persistence
- Grants/USAspending adapters (wrap into corpus sync + live merge)
- Deploy, rate limits, fixture safety tests

### Replace / reshape into FundPath-like brain
- `opportunity-matching.ts`, `opportunity-intelligence.ts`
- Expansion/query building (`concept-normalization` / `buildSearchQueries`) as corpus retrieval takes over
- Discovery ranking core; search orchestration middle (keep rank-before-enrich + listing pass)
- Reassess permanent need for semantic-review once tiers exist (may keep as optional downgrade)

---

## 7. Phased execution (do in order)

Between phases: short context note (done / next / risks). Before coding a phase: agent states **in 2 lines** what it will build.

### Phase 0 — Branch hygiene
- Confirm work stays on `post-hackathon-v2`
- Add README attribution for FundPath
- Add empty `CORPUS_DB` binding + migration stub (no behavior change yet)

**Exit:** Attribution live; corpus DB created/bound

### Phase 1 — Corpus spine (pairs with V2 Stage B stores)
- Schema: opportunities, awards, utah_resources, corpus_meta
- Import FundPath `corpus.snapshot.json` (convert timestamps)
- Seed federal + Utah curated programs with provenance
- Sync scripts for Grants.gov + USAspending; cron can follow in Stage B

**Exit:** CORPUS_DB populated; import reproducible; health check

### Phase 2 — Deterministic brain
- Port eligibility / scoring / tiering / sequencing / stacking / abstention / expansion
- Map V2 confirmed profile → brain fields
- `route-builder` behind temporary flag
- Tests: five fixtures, abstention, municipal-prime warn, nationwide federal (non-Utah profile still gets federal route)

**Exit:** Flag-on path produces FundPath-like routes; Luna not used for tiers

### Phase 3 — Explanations + historical density
- Luna four-section explanations + template fallback
- Historical helper on primary stops
- Keep listing research pass on returned stops

**Exit:** Cards/route show proof + explanations

### Phase 4 — UI presentation (no redesign)
- Map brain output into existing workbench/dashboard
- Verdict, timeline, alongside, off-route, non-grant, stacking
- Utah contacts when location is Utah (or clearly labeled GOED network); never block federal matches for non-Utah
- Preserve orb + error vs empty-match

**Exit:** Browser: healthcare route + consumer abstention; non-Utah federal still works

### Phase 5 — Apply depth (FundPath apply kit)
- Registration timeline (SAM backwards from close date)
- Starter-kit checklist + portal hints
- SF-424 PDF fill (`pdf-lib`) → browser download or R2
- Luna narrative drafts labeled as drafts

**Exit:** One stop → timeline + kit + optional SF-424

### Phase 6 — Align with V2 C/D (separate; not FundPath core)
- OAuth, email, settings, SAM procurement beyond seeds — only when those V2 stages start
- No Twilio/Resend unless explicitly approved later

### Parallelism
| Track A | Track B |
|---|---|
| Corpus D1 + import | Pure TS rules + tests |
| Sync scripts | Profile field mapping |
| Later: cron | Later: UI route mapping |

One agent builds; a second bugfixes.

---

## 8. Profile mapping (V2 → brain)

| V2 | Brain |
|---|---|
| summarized description | keywords; never evidence dump |
| industry / technology / researchActivities | vertical, NAICS, `hasRdCore` |
| location | geography; Utah resource boost if Utah |
| employees | SBIR size |
| capitalNeed / capitalRaised / revenue | ask band |
| applicantType / ownership / usEntityStatus | eligibility |
| samStatus / uei | registration timeline |
| useOfFunds / productStage | sequencing / non-grant |

Search prefers founder-confirmed values; keep tags visible in UI.

---

## 9. Safety gates

1. Same pipeline for all official profiles — no hard-coded outputs  
2. Official facts: source id, URL, retrieval time (or curated provenance)  
3. Luna/research never create/upgrade eligibility, scores, dates, amounts  
4. Unknown critical eligibility capped (Potential Fit / FundPath equivalent)  
5. Current ≠ historical  
6. Search failure ≠ honest no-match  
7. Unsupported application fields blank  
8. No direct government form submission  
9. No secrets in client / prompts / logs / commits  
10. Non-Utah companies still receive federal matching  
11. Stage A intake/listing does not regress  
12. Temporary flag removed after parity  

---

## 10. Done

**Core:** V2 intake → FundPath-like sequenced route on Cloudflare; Luna extract/explain only; fixtures + abstention green; CORPUS_DB live; attribution in README; no new paid SaaS.

**Then:** registration timeline, starter kit, SF-424.

**Not this plan’s job:** OAuth/SMS/email/settings (V2 C/D).

---

## 11. Rollback

- During port: flag off → prior V2 matcher  
- After parity: flag deleted; fix forward on FundPath-like brain  
- CORPUS_DB additive; workspace DB untouched  

---

## 12. Immediate next step

Start **Phase 0** on `post-hackathon-v2`: README attribution + `CORPUS_DB` binding stub, then **Phase 1** corpus import.
