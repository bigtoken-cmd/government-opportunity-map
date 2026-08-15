# Government Opportunity Map — P0 Decision and Verification Plan

This is the authoritative solution, decision, and checklist document. Status labels are limited to **Implemented**, **Verified**, **Planned**, **Blocked**, and **Deferred**.

## Current decision snapshot

| Area | Status | Evidence-backed decision |
| --- | --- | --- |
| Canonical profile and matching pipeline | Implemented | One typed, deterministic pipeline normalizes founder-confirmed company input, searches role-separated source adapters, evaluates eligibility, scores, ranks, and creates explanation data. |
| Deterministic safety rules | Verified | Tests cover hard failures, unknown-critical-field caps, source roles/states, five shared-pipeline fixtures, three holdouts, explanations, and opportunity-scoped checklist serialization. |
| Live Grants.gov and USAspending retrieval | Implemented | Adapters support live retrieval and role-specific official fallbacks; fresh live execution must be recorded per verification run. |
| Assistance Listings live retrieval | Blocked | The adapter deliberately returns the audited official snapshot until the published endpoint schema is verified; it also requires `GSA_API_KEY` for a future live path. |
| SBIR live retrieval | Blocked | Verified published API routes returned 404; the adapter returns no substituted award and never calls it a current opportunity. |
| Model integration | Planned | **Locked choice:** GPT-5.6 Luna, medium effort/fast reasoning, for the single planned app API model. The provider API ID was not supplied as user-confirmed; no model SDK/API invocation is present and the Cloudflare secret remains unverified. |
| Production persistence / D1 | Planned | Opportunity-scoped workspace state is serialized and tested; a deployed D1 binding and database calls are not evidenced here. |

## P0 solution contract

**Bounded website/PDF/manual input → evidence-backed canonical company JSON → founder confirmation → four role-separated official adapters → normalized records with provenance → deterministic eligibility and disqualifiers → deterministic score/rank and separate deadline urgency → deterministic explanation → recommendations and one opportunity-scoped workspace.**

- Input may only create claims traceable to supplied website, PDF, or manual evidence. Unknown fields remain unknown and become founder questions; founders confirm before search.
- Every government fact retains source ID, official URL, retrieval time, and source/fact state. Normalized data separates current opportunities, program context, and historical awards.
- User-facing fields and headings use high-school reading level: name, agency, fit, why it fits, what to verify, deadline/urgency, funding, next step, and source freshness. Raw JSON, hashes, normalization data, API fields, and internal codes stay backend-only.

### Model boundary and secret policy

- A model is allowed only for server-side structured extraction of supplied evidence and an optional constrained wording pass.
- Deterministic code exclusively owns source verification, eligibility, disqualifiers, scores, deadlines, historical totals, and result decisions. A wording pass may not add or change facts, evidence IDs, sources, dates, amounts, scores, eligibility, or decisions; it falls back to deterministic wording.
- **Planned:** GPT-5.6 Luna is the single planned app API model, constrained to server-side extraction and optional wording. No model call is implemented; the provider API ID and secret presence remain unverified.
- `OPENAI_API_KEY` is server-only: `.env.local` locally and a Cloudflare secret in production. Never use `NEXT_PUBLIC_*`, print, read, store, or commit a value. **Blocked:** secret presence is external and unverified. Provisioning the key does not change model integration from Planned.

## Four official source roles and status

| Source | Role | Status | Honest behavior |
| --- | --- | --- | --- |
| Grants.gov | Current and forecast opportunities | Implemented | Supports live search plus a role-matched official cached fallback. Valid empty results remain live; malformed or failed responses are labeled honestly. |
| SAM.gov / Open GSA Assistance Listings | Program context only | Blocked | Returns the audited official snapshot while endpoint schema/live use is unverified. Never presents a program as an open opportunity. |
| USAspending | Historical awards only | Implemented | Supports live retrieval by Assistance Listing plus a role-matched official cached fallback. Never presents awards as current opportunities. |
| SBIR.gov | Only its supported official award record type | Blocked | Published routes returned 404 during verification; returns no substituted record and never relabels history as a solicitation. |

## Discovery, matching, and presentation policy

- **Implemented:** normalization carries matching concepts into sourced records, and the current single-keyword selector suppresses generic “artificial intelligence.”
- **Planned:** grouped query generation, explicit literal-versus-controlled-synonym accounting, and query-level noise suppression beyond the current generic-term rule.
- **Implemented:** source results report live, cached, cached-fallback, or unavailable states, with warnings. Valid-empty, malformed, transport-failure, and cached behaviors have source-state tests.
- **Verified:** frozen test-only calibration judgments contain five verifier profiles plus three controls, source IDs/URLs/retrieval timestamps/provenance hashes, explicit calibration and locked-holdout splits, direct/synonym/broad-mission labels, ablations, and three predefined distributions. All distributions measured recall@20 1.00, weighted precision@10 0.50, positive-profile floor 1.00, locked positive recall@20 1.00, and zero actionable negatives; positive-negative separation was 35/35/40 points for current/synonym-forward/direct-forward. Current weights remain unchanged because no candidate improved precision or holdout safety.
- **Implemented, starting hypothesis only:** the 100-point score uses mission 25, exact terms 20, controlled concepts 15, technology/R&D 15, customer/use 10, amount 10, and geography 5. Strict eligibility runs before results; hard failures are excluded with plain reasons, and unknown critical facts cap a result at Potential Fit. Deadline urgency is separate and only breaks score ties.
- **Implemented:** default results show the top five qualifying current/forecast opportunities. Current opportunities, program context, and historical awards stay separate. An honest no-match result is required when no candidate qualifies.
- **Planned:** when an all-qualifying view is added, cap it at 20 and preserve excluded hard failures in a plain-language collapsed section.

## Application workspace and explanations

- **Implemented:** the workspace state is versioned and opportunity-scoped; source-backed fields can prefill supported application information while unsupported fields remain blank founder questions. Direct government-form submission is not allowed.
- **Planned:** connect that state to durable production persistence after a D1 design and binding are evidenced. Do not claim D1 is active before then.
- **Implemented:** a deterministic explanation object carries matched groups, eligibility checks, reason, and source provenance. **Planned:** optional constrained model wording, with deterministic fallback.

## Verification gate

| Check | Status | Required proof |
| --- | --- | --- |
| Five fixtures and three controls | Verified | The current Node suite runs all five verifier-only fixtures through the cached shared pipeline and prevents Strong Fit for three adversarial holdouts. |
| Fixture and reward-hacking boundary | Verified | Fixtures are verifier-only; no case-specific opportunity outputs are allowed. Frozen snapshots, manual labels, ablations, and a locked holdout are required before calibration claims. |
| Source-state honesty | Verified | Tests distinguish valid empty, malformed, cached, cached-fallback, unavailable, and source-role behavior. |
| Local/cached/live fallback | Implemented | Source contracts and adapters expose those modes; fresh live verification is still required in the run record. |
| Route contracts | Verified | Search route rejects invalid JSON and missing confirmed descriptions; cached role-separated responses include source warnings; website intake has an injected-fetch evidence-only shape test. |
| Browser and reload matrix | Blocked | Observe direct URL, soft navigation, hard reload, cached versus fresh display, desktop, and mobile. Verify state transition from initial workspace to checklist change to reload. |
| Cloudflare production verification | Blocked | Verify deployment, secret binding without exposing it, source states, and browser matrix in production. |
| P0 exit | Planned | Two consecutive dependency-free suites passed 24/24. ESLint, TypeScript, production build, diff check, and IDE lints passed. Browser verification remains unverified because Chromium was unavailable. |

## Deferred until P0 passes twice

**Deferred:** OAuth, email, calendar, settings, help, mascot/animation, RAG, dashboards, extra sources, multiple workspaces, and direct government-form submission.

## Completion-pass evidence — August 14, 2026

- **Verified:** `npm test && npm test` completed twice consecutively with 24/24 tests passing each run, including malformed JSON, missing profile, cached role separation, source states, website evidence-only intake, fixture boundary, holdouts, checklist isolation, calibration metrics, ablations, and direct/synonym invariants.
- **Verified:** `npm run lint`, `git diff --check`, and IDE lints passed.
- **Verified:** `npx tsc --noEmit` and `npm run build` completed successfully after the prior disk-capacity issue was cleared; no dependency or lockfile change was made.
- **Blocked:** browser matrix was not observed. Playwright could not start because the Chrome distribution was unavailable; no direct visit, soft navigation, reload, checklist transition, cached/fresh label, desktop/mobile screenshot, console, or network observation is claimed.
- **UNVERIFIED:** no production deployment or Cloudflare secret verification was attempted.
