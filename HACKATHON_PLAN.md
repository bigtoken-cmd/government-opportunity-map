# Government Opportunity Map — P0 Decision and Verification Plan

This is the authoritative solution, decision, and checklist document. Status labels are limited to **Implemented**, **Verified**, **Planned**, **Blocked**, and **Deferred**.

## Current decision snapshot

| Area | Status | Evidence-backed decision |
| --- | --- | --- |
| Canonical profile and matching pipeline | Implemented | One typed, deterministic pipeline normalizes founder-confirmed company input, searches role-separated source adapters, evaluates eligibility, scores, ranks, and creates explanation data. |
| Deterministic safety rules | Verified | Tests cover hard failures, unknown-critical-field caps, source roles/states, five shared-pipeline fixtures, three holdouts, explanations, and opportunity-scoped checklist serialization. |
| Live Grants.gov and USAspending retrieval | Implemented | Adapters support live retrieval and role-specific official fallbacks; fresh live execution must be recorded per verification run. |
| Assistance Listings bulk retrieval | Implemented | Conditional ingestion, CSV normalization, compact lookup, provenance, and last-valid fallback are tested against the official public SAM.gov Assistance Listings extract. A deployed scheduler/store remains Planned. |
| SBIR bulk retrieval | Implemented | Conditional monthly ingestion, streaming normalization, compact historical lookup, and honest empty fallback are tested against the official public SBIR award extract. Awards never become current solicitations. |
| Model integration | Implemented | GPT-5.6 Luna (`gpt-5.6-luna`) is consent-gated and server-only for website, manual, and extracted/pasted PDF evidence. Strict sanitization, schema/evidence validation, timeout/error fallback, `store: false`, the shared disclosure, and route size bounds are tested; a real credentialed call remains Blocked. |
| Persistence logic | Implemented | Opaque workspace credentials, token hashing, bounded persisted fields, opportunity-scoped persistence logic, a prepared-statement D1 adapter/migration, runtime binding detection, and the client fallback contract are tested. |
| Durable D1 deployment | Planned / Blocked | `WORKSPACE_DB` has no deployed resource binding or database ID; migration application and production persistence verification remain Blocked. |

## P0 solution contract

**Bounded website/PDF/manual input → evidence-backed canonical company JSON → founder confirmation → four role-separated official adapters → normalized records with provenance → deterministic eligibility and disqualifiers → deterministic score/rank and separate deadline urgency → deterministic explanation → recommendations and one opportunity-scoped workspace.**

- Input may only create claims traceable to supplied website, PDF, or manual evidence. Unknown fields remain unknown and become founder questions; founders confirm before search.
- Every government fact retains source ID, official URL, retrieval time, and source/fact state. Normalized data separates current opportunities, program context, and historical awards.
- User-facing fields and headings use high-school reading level: name, agency, fit, why it fits, what to verify, deadline/urgency, funding, next step, and source freshness. Raw JSON, hashes, normalization data, API fields, and internal codes stay backend-only.

### Model boundary and secret policy

- A model is allowed only for server-side structured extraction of supplied evidence and an optional constrained wording pass.
- Deterministic code exclusively owns source verification, eligibility, disqualifiers, scores, deadlines, historical totals, and result decisions. A wording pass may not add or change facts, evidence IDs, sources, dates, amounts, scores, eligibility, or decisions; it falls back to deterministic wording.
- **Implemented:** GPT-5.6 Luna (`gpt-5.6-luna`) is the single app API model for server-side extraction. Every call requires explicit external-processing consent, removes obvious submitted credential values, sends `store: false`, accepts only a strict completed response shape, and falls back deterministically.
- `OPENAI_API_KEY` is server-only: `.env.local` locally and a Cloudflare secret in production. Never use `NEXT_PUBLIC_*`, print, read, store, or commit a value. **Blocked:** secret presence and a real model response remain externally unverified.
- Raw website, manual, and PDF evidence is not logged or persisted server-side. **Implemented:** the founder-facing UI shows the shared OpenAI disclosure, requires explicit consent, and sends `externalProcessingConsent: true`; manual/PDF provider failure returns an editable deterministic profile with honest status.

## Four official source roles and status

| Source | Role | Status | Honest behavior |
| --- | --- | --- | --- |
| Grants.gov | Current and forecast opportunities | Implemented | Supports live search plus a role-matched official cached fallback. Valid empty results remain live; malformed or failed responses are labeled honestly. |
| SAM.gov Assistance Listings | Program context only | Implemented | Supports scheduled ingestion of the official public CSV into a compact store and retains the audited fallback until a valid snapshot is available. Never presents a program as an open opportunity. |
| USAspending | Historical awards only | Implemented | Supports live retrieval by Assistance Listing plus a role-matched official cached fallback. Never presents awards as current opportunities. |
| SBIR.gov | Historical SBIR/STTR awards only | Implemented | Supports scheduled ingestion of the official monthly no-abstract CSV into a compact store and keeps an honest empty fallback before a valid snapshot exists. Never relabels history as a solicitation. |

## Discovery, matching, and presentation policy

- **Implemented:** normalization carries matching concepts into sourced records. Bounded grouped queries preserve direct-versus-controlled concepts, deduplicate terms, suppress generic noise, and retain validated records when one grouped query fails.
- **Implemented:** source results report live, cached, cached-fallback, or unavailable states, with warnings. Valid-empty, malformed, transport-failure, and cached behaviors have source-state tests.
- **Verified:** frozen judgments retain internal opportunity IDs plus official source IDs/URLs/retrieval timestamps/provenance hashes. The cached production pipeline retrieves a frozen relevant result for all three calibration positives and the locked cyber holdout, returns zero recommendations for four negative controls, and measures pooled precision@10 at 0.75.
- **Implemented, starting hypothesis only:** the 100-point score uses mission 25, exact terms 20, controlled concepts 15, technology/R&D 15, customer/use 10, amount 10, and geography 5. Strict eligibility runs before results; hard failures are excluded with plain reasons, and unknown critical facts cap a result at Potential Fit. Deadline urgency is separate and only breaks score ties.
- **Implemented:** default results show the top five qualifying current/forecast opportunities. Current opportunities, program context, and historical awards stay separate. An honest no-match result is required when no candidate qualifies.
- **Planned:** when an all-qualifying view is added, cap it at 20 and preserve excluded hard failures in a plain-language collapsed section.

## Application workspace and explanations

- **Implemented:** the workspace state is versioned and opportunity-scoped; source-backed fields can prefill supported application information while unsupported fields remain blank founder questions. Direct government-form submission is not allowed.
- **Implemented:** founder contact remains outside matching, opaque workspace credentials are isolated, stores receive token hashes only, and persistence rejects prototype-polluting checklist keys.
- **Implemented:** the UI stores opaque credentials locally, restores durable checklist/contact state, creates or updates through `/api/workspace`, removes invalid credentials on 401, stops retrying after 503, and labels device-only versus durable save mode honestly. The route selects the D1 prepared-statement store only when `WORKSPACE_DB` exists.
- **Planned / Blocked:** create and bind the D1 resource, apply `migrations/0001_workspace.sql`, and evidence a production browser round trip before claiming deployed durability.
- **Implemented:** a deterministic explanation object carries matched groups, eligibility checks, reason, and source provenance. **Planned:** optional constrained model wording, with deterministic fallback.

## Verification gate

| Check | Status | Required proof |
| --- | --- | --- |
| Five fixtures and controls | Verified | The current Node suite runs all five verifier-only fixtures through the cached shared pipeline and requires zero actionable recommendations for consumer plus three adversarial controls. |
| Fixture and reward-hacking boundary | Verified | Fixtures are verifier-only; no case-specific production outputs are allowed. Calibration metrics now consume actual cached production recommendations rather than locally re-scoring labels. |
| Source-state honesty | Verified | Tests distinguish valid empty, malformed, cached, cached-fallback, unavailable, and source-role behavior. |
| Local/cached/live fallback | Implemented | Grants.gov and USAspending preserve live/fallback states; Assistance Listings and SBIR scheduled ingestors preserve last-valid official snapshots without calling them live. |
| Route contracts | Verified | Search and workspace response shapes are frozen; website compatibility is preserved, manual/PDF intake enforces consent and byte bounds, and focused tests cover extraction fallback, client bearer credentials, D1 behavior, and binding selection. |
| Browser and reload matrix | Blocked | Observe direct URL, soft navigation, hard reload, cached versus fresh display, desktop, and mobile. Verify state transition from initial workspace to checklist change to reload. |
| Cloudflare production verification | Blocked | Verify deployment, secret binding without exposing it, source states, and browser matrix in production. |
| Combined-main automated verification | Verified | The consolidated backend tree passed two consecutive 77/77 suites plus ESLint, TypeScript, production build, and diff check. |
| P0 exit | Planned | Combined-main automated verification is complete. Browser, durable D1/scheduler deployment, secret, credentialed live-source/model, and production verification remain. |

## Remaining P0 handoff

### Jacob / UI and deployment

- **Implemented:** shared disclosure/consent, manual/PDF route wiring, separate program-context presentation, and durable-workspace client/local fallback.
- Create and bind `WORKSPACE_DB`, apply the workspace migration, add scheduled Assistance Listings/SBIR deployment bindings and the server-only `OPENAI_API_KEY`.
- Complete direct-visit, soft-navigation, hard-reload, cached/fresh, desktop/mobile, console/network, consent/fallback, and durable checklist-persistence browser verification with screenshots.

### Lincoln / integration

- **Verified:** the recovered Lincoln files have no direct overlap with Jacob’s workbench, checklist, or global CSS changes.
- **Verified:** the combined `origin/main` tree passed 77/77 twice, lint, TypeScript, production build, and diff check.
- **Verified:** fresh public-fixture probes returned live Grants.gov and USAspending records. Assistance Listings and SBIR remained honestly labeled cached-fallback until scheduled stores are deployed.
- Perform one credentialed Luna probe without logging the key, raw evidence, or model input/output.
- Keep `recovery/lincoln-data-20260814-v2` and `stash@{0}` until the recovered work is committed safely; do not drop the recovery stash during handoff.

## Deferred until P0 passes twice

**Deferred:** OAuth, email, calendar, settings, help, mascot/animation, RAG, dashboards, extra sources, multiple workspaces, and direct government-form submission.

## Completion-pass evidence — August 14, 2026

- **Verified:** `npm test && npm test` completed twice consecutively with 64/64 tests passing each run, including production-pipeline calibration, controls, grouped queries, consent-gated Luna extraction, credential sanitization, strict model response validation, opaque workspace persistence, and scheduled official CSV ingestion.
- **Verified:** `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed in the healthy local recovery clone; no dependency or lockfile change was made.
- **Blocked:** browser matrix was not observed. Playwright could not start because the Chrome distribution was unavailable; no direct visit, soft navigation, reload, checklist transition, cached/fresh label, desktop/mobile screenshot, console, or network observation is claimed.
- **Blocked:** no production deployment, D1/scheduler binding, Cloudflare secret verification, or live OpenAI response was attempted.

## Final-review fix-wave evidence — August 15, 2026

- **Verified:** the combined backend tree completed two consecutive `npm test` runs with 77/77 passing each run. The earlier 64/64 completion-pass evidence above remains the exact historical result from August 14.
- **Verified:** ESLint, TypeScript, the production build, and `git diff --check` passed after the consolidated final-review fixes.
- **Verified:** fresh healthcare and advanced-manufacturing probes returned live Grants.gov and USAspending source states; scheduled Assistance Listings and SBIR stores were not configured and fell back honestly.
- **Planned/Blocked:** durable D1 and scheduler deployment remain unconfigured and unverified. Browser, production, secret, and credentialed live-source/model checks remain Blocked.

## P0 integration implementation — August 15, 2026

- **Implemented:** consent-gated manual/PDF intake, the shared disclosure, supported profile-field merging, separate persisted program context, the D1 workspace adapter/migration, Cloudflare binding detection, client persistence, credential recovery, 503 suppression, and truthful save mode.
- **Verified:** 26/26 focused integration tests passed for evidence intake, profile suggestion filtering, website compatibility/source roles, workspace route/service behavior, POST/GET/PUT client requests, bearer credentials, D1 prepared statements, and binding selection. The workbench file also passed focused ESLint.
- **Planned / Blocked:** no D1 resource ID or `WORKSPACE_DB` binding exists, so migration application and production durability remain Blocked.
- **Blocked:** browser screenshots/state transitions, deployment, Cloudflare/OpenAI secrets, and a credentialed Luna call remain externally unverified.
