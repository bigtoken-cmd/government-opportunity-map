# Government Opportunity Map

A founder-first research aid that turns a founder-confirmed company profile into defensible government opportunities, clear next actions, and an opportunity-scoped application workspace.

The authoritative decisions, P0 checklist, and verification gate are in [HACKATHON_PLAN.md](./HACKATHON_PLAN.md). The internal repository-audit canvas is evidence-only: it records what code and tests support, not product promises.

## Current architecture

1. Bounded website, PDF, or manual evidence becomes canonical company JSON; unsupported facts remain unknown for founder confirmation.
2. Server-side adapters return normalized official records with source ID, URL, retrieval time, and honest source state.
3. Deterministic code owns eligibility, disqualifiers, the 100-point starting score, deadline tie-breaks, historical totals, and result decisions.
4. Results keep current/forecast opportunities, program context, and historical awards separate. They show five qualifying recommendations by default, with an honest no-match path; an all-qualifying view capped at 20 is Planned.
5. A deterministic explanation object and opportunity-scoped checklist state support source-backed application prefill; unsupported fields stay blank founder questions.

## Source roles and status

- **Grants.gov — Implemented:** current and forecast opportunities; live search code with role-matched official cached fallback.
- **SAM.gov / Open GSA Assistance Listings — Blocked:** program context only; the audited official snapshot is used while the published endpoint schema/live behavior remains unverified.
- **USAspending — Implemented:** historical awards only; live retrieval code with role-matched official cached fallback.
- **SBIR.gov — Blocked:** historical award records only. Published API routes returned 404 during verification, so no record is substituted.

Live execution is a run-specific verification claim, not implied by adapter code. Valid-empty, malformed, failed, cached, and live source states remain visible in source results.

## Model and secrets

- Next.js 16 and TypeScript
- Cloudflare Workers through the OpenNext adapter
- Deterministic matching, explanations, and workspace-state serialization
- **Planned (locked choice):** GPT-5.6 Luna at medium effort/fast reasoning is the single planned app API model. It remains limited to server-side structured extraction of supplied evidence and optional constrained wording; no model SDK/API call is implemented. The provider API ID was not supplied as user-confirmed, and Cloudflare secret presence remains unverified.
- `OPENAI_API_KEY` is server-only: `.env.local` locally and a Cloudflare secret in production. Never use `NEXT_PUBLIC_*`, print, read, store, or commit its value. Secret presence is external and unverified; provisioning it is not model integration.

## Status

- **Implemented:** canonical profile normalization, provenance-bearing source contracts, four role-separated adapters, strict eligibility/unknown cap, 100-point starting rubric, top-five discovery, deterministic explanations, and opportunity-scoped checklist serialization.
- **Verified:** automated tests cover five verifier-only shared-pipeline fixtures, three adversarial holdouts, source-role/state behavior, deterministic matching, explanations, workspace-state isolation, and website evidence-only intake.
- **Verified:** frozen test-only calibration/query-log evidence covers five verifier profiles plus three controls, explicit splits, source provenance hashes, literal/direct versus controlled-synonym versus broad-mission labels, ablations, and three predefined score distributions. Current and both candidates achieved recall@20 1.00, weighted precision@10 0.50, positive-profile floor 1.00, locked positive recall@20 1.00, and zero actionable negatives; separations were 35/35/40. Current weights were retained.
- **Planned:** grouped queries and broader noise suppression; durable D1 persistence after an evidenced binding and database implementation.
- **Blocked:** Assistance Listings live schema validation, SBIR live routes, production secret presence, and route/browser/reload/desktop/mobile verification.
- **Deferred:** OAuth, email, calendar, settings, help, mascot, RAG, dashboard work, extra sources, and direct government-form submission until P0 passes twice.

## Latest verification evidence

- **Verified:** two consecutive full `npm test` runs passed 24/24; route coverage includes malformed JSON, missing profile, cached role separation, source warnings, and injected-fetch website evidence-only output.
- **Verified:** ESLint, `git diff --check`, and IDE lints passed.
- **Verified:** TypeScript and the production build completed successfully after the prior disk-capacity issue was cleared; no dependency or lockfile change was made.
- **Blocked:** browser/state matrix was not observed because Playwright could not start without a local Chrome distribution. No screenshot, console, network, desktop/mobile, navigation, reload, cached/fresh, or checklist-transition claim is made.

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
