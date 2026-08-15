# Government Opportunity Map

A founder-first research aid that turns a founder-confirmed company profile into defensible government opportunities, clear next actions, and an opportunity-scoped application workspace.

The authoritative decisions, P0 checklist, and verification gate are in [HACKATHON_PLAN.md](./HACKATHON_PLAN.md). The internal repository-audit canvas is evidence-only: it records what code and tests support, not product promises.

## Current architecture

1. Bounded website, extracted/pasted PDF text, or manual evidence becomes canonical company JSON after the founder accepts the shared OpenAI disclosure; unsupported facts remain unknown for founder confirmation.
2. Server-side adapters return normalized official records with source ID, URL, retrieval time, and honest source state.
3. Deterministic code owns eligibility, disqualifiers, the 100-point starting score, deadline tie-breaks, historical totals, and result decisions.
4. Results keep current/forecast opportunities, program context, and historical awards separate. They show five qualifying recommendations by default, with an honest no-match path; an all-qualifying view capped at 20 is Planned.
5. A deterministic explanation object and opportunity-scoped checklist state support source-backed application prefill; unsupported fields stay blank founder questions.

## Source roles and status

- **Grants.gov — Implemented:** current and forecast opportunities; live search code with role-matched official cached fallback.
- **SAM.gov Assistance Listings — Implemented:** program context only; scheduled official public-CSV ingestion feeds a compact cached store, with the audited snapshot retained until a valid ingestion exists.
- **USAspending — Implemented:** historical awards only; live retrieval code with role-matched official cached fallback.
- **SBIR.gov — Implemented:** historical awards only; scheduled official monthly-CSV ingestion feeds a compact cached store, with an honest empty fallback before a valid ingestion exists.

Live execution is a run-specific verification claim, not implied by adapter code. Valid-empty, malformed, failed, cached, and live source states remain visible in source results.

## Model and secrets

- Next.js 16 and TypeScript
- Cloudflare Workers through the OpenNext adapter
- Deterministic matching, explanations, and workspace-state serialization
- **Implemented:** GPT-5.6 Luna (`gpt-5.6-luna`) is the single app API model for consent-gated, server-side structured extraction of supplied evidence. Obvious submitted credentials are removed before processing; strict schema/evidence checks and deterministic fallback prevent model output from controlling government facts or decisions.
- `OPENAI_API_KEY` is server-only: `.env.local` locally and a Cloudflare secret in production. Never use `NEXT_PUBLIC_*`, print, read, store, or commit its value. Secret presence and a real credentialed model response remain externally unverified.
- **Implemented:** the UI shows the shared OpenAI disclosure, requires consent, sends `externalProcessingConsent: true`, and routes website/manual/PDF text through the same server extraction boundary. Raw supplied evidence is not logged or persisted server-side, and requests use `store: false`.

## Status

- **Implemented:** canonical profile normalization, provenance-bearing source contracts, four role-separated adapters, strict eligibility/unknown cap, 100-point starting rubric, top-five discovery, deterministic explanations, and opportunity-scoped checklist serialization.
- **Verified:** automated tests cover five verifier-only shared-pipeline fixtures, three adversarial holdouts, source-role/state behavior, deterministic matching, explanations, workspace-state isolation, and website evidence-only intake.
- **Verified:** calibration consumes actual cached production recommendations. All calibration positives and the locked cyber holdout retrieve a frozen relevant opportunity, four negative controls receive zero recommendations, and pooled precision@10 is 0.75.
- **Implemented:** bounded grouped queries, noise suppression, strict Luna extraction, consent/size-bounded manual/PDF intake, separate program-context presentation, scheduled Assistance Listings/SBIR ingestion logic, and opaque workspace persistence through a tested D1 adapter/client with immediate local fallback.
- **Planned/Blocked:** the D1 resource, `WORKSPACE_DB`, migration application, and scheduled-ingestion bindings are not deployed; production persistence verification remains Blocked. No database ID is hardcoded.
- **Blocked:** production secret presence, credentialed live probes, and route/browser/reload/desktop/mobile verification.
- **Deferred:** OAuth, email, calendar, settings, help, mascot, RAG, dashboard work, extra sources, and direct government-form submission until P0 passes twice.

## Latest verification evidence

- **Verified:** two consecutive full `npm test` runs passed 64/64, including production-pipeline calibration, grouped queries, scheduled CSV ingestion, opaque persistence, and consent-gated Luna extraction.
- **Verified:** after the consolidated final-review fixes, combined-main automated verification passed two consecutive 77/77 suites. The prior 64/64 line remains the exact historical August 14 evidence.
- **Verified:** ESLint, TypeScript, the production build, and `git diff --check` passed in the healthy local recovery clone; no dependency or lockfile change was made.
- **Verified:** fresh healthcare and advanced-manufacturing probes returned live Grants.gov and USAspending records; Assistance Listings and SBIR stayed honestly cached-fallback until scheduled stores are deployed.
- **Verified:** 26/26 focused P0 integration tests passed for consent/success/fallback/size, supported profile merging, source-role compatibility, workspace POST/GET/PUT bearer requests, D1 prepared statements, and runtime binding selection; focused workbench ESLint passed.
- **Blocked:** browser/state matrix was not observed because Playwright could not start without a local Chrome distribution. No screenshot, console, network, desktop/mobile, navigation, reload, cached/fresh, or checklist-transition claim is made.

## Remaining P0 handoff

- Deployment: create/bind D1 as `WORKSPACE_DB`, apply `migrations/0001_workspace.sql`, configure scheduled ingestions and the server-only OpenAI secret, and complete browser/deployment evidence.
- Integration: run one credentialed Luna probe without logging inputs or secrets; verify consent/fallback, program context, direct/soft/reload, cached/fresh, desktop/mobile, and durable checklist transitions.

## Local development

```bash
npm install
npm run dev
```

Cloudflare-runtime preview:

```bash
npm run preview
```

Deployment:

```bash
npm run deploy
```

Run the deterministic suite with:

```bash
npm test
```

## Ownership

- Jacob: founder-facing UI, profile review, application workspace presentation, deployment, browser QA, and merges
- Lincoln: source adapters, normalization, terminology, hard checks, matching, history, persistence logic, and backend tests

See `AGENTS.md` before using a coding agent. This product does not make definitive eligibility determinations or submit directly to government forms.
