# Government Resource Finder — Final Two-Hour Release Plan

> [!IMPORTANT]
> **ACTIVE IMPLEMENTATION PLAN — August 15, 2026.** This is the single authority for the remaining pre-submission work, the Jacob/Lincoln split, verification cadence, merge order, Cloudflare checks, and deployment decisions. `JACOB_BACKEND_INTELLIGENCE_HANDOFF.md`, `HACKATHON_PLAN.md`, and `JACOB_CHECKLIST.md` are retained only as historical records.

## Objective

Use one shared, deployed `main` baseline, then spend a strict two hours improving the two things that most affect judge trust:

1. Every displayed recommendation must be defensible under deterministic fallback, even when Luna is unavailable.
2. The frontend must distinguish successful no-match outcomes, search failures, extracted facts, and founder-confirmed facts honestly.

Do not redesign the product. Do not expand into procurement or a new intelligence architecture during this pass.

## Current baseline

- Backend intelligence and the civic-editorial UI are merged locally.
- Intake uses `/api/intake/bundle` for website, text, PDF, DOCX, and PPTX evidence.
- Confirmed profiles use `/api/opportunities/search`.
- Semantic review is consent-gated and can only preserve, downgrade, or remove deterministic recommendations.
- Effective scores, concerns, next actions, official sources, and historical award examples reach the UI.
- Production demo-state paths have been removed.
- `main` pushes automatically run lint, TypeScript, build, and Cloudflare deployment through `.github/workflows/deploy.yml`.
- Deployment during this pass is authorized. The live URL is not being actively judged yet, and updating it with working incremental improvements is acceptable.

## Shared safety rules

- Never hard-code output for a verifier profile or specific company.
- Government facts remain official-source-backed.
- Luna never creates eligibility, scores, dates, amounts, sources, or upgrades.
- Current opportunities, program context, and historical awards remain separate.
- Unknown eligibility remains unknown.
- A search failure must never be presented as a legitimate no-match.
- Historical funding never proves current eligibility.
- Do not expose, read, print, or log secrets.

## Two-computer setup

### Shared baseline

The first push of this plan to `main` is the shared baseline and will deploy automatically. Both workstreams must branch from the exact resulting `origin/main` SHA.

### Jacob's computer

```bash
git switch main
git pull --ff-only origin main
git switch -c jacob-match-precision
```

Jacob owns:

- `src/lib/opportunity-matching.ts`
- Narrow supporting changes in concept normalization, opportunity discovery, or recommendation intelligence only when required by the precision fix
- Matching regression fixtures and backend tests
- Live five-profile search review
- Cloudflare verification from the authenticated computer

Jacob should avoid `src/app/components/**` and `src/app/globals.css`.

### Lincoln's computer

Create or switch to a dedicated frontend branch from the same pushed `main` SHA:

```bash
git switch main
git pull --ff-only origin main
git switch -c lincoln-release-ui
```

Lincoln owns:

- `src/app/components/opportunity-workbench.tsx`
- `src/app/components/resource-dashboard.tsx`
- `src/app/components/product-primitives.tsx`
- `src/app/globals.css`
- Frontend-focused tests

Do not recreate matching or government intelligence in the client.

## Cloudflare checkpoint — run on Jacob's computer

Run this immediately after pulling the shared baseline. Repository deployment evidence says the remote migration is already applied, and the current release adds no new migration. Verify first:

```bash
npx wrangler whoami
npx wrangler d1 migrations list WORKSPACE_DB --remote
```

Expected result: no pending migrations. Only if `0001_workspace.sql` is reported as pending:

```bash
npx wrangler d1 migrations apply WORKSPACE_DB --remote
```

Do not create a second D1 database, change the binding, rotate secrets, or read secret values. If Cloudflare authentication or the configured resource does not match the repository, stop and report the exact non-secret error.

## Final two-hour schedule

### 0:00–0:10 — synchronize and freeze failures

**Jacob**

- Pull `main`, create `jacob-match-precision`, and run the Cloudflare checkpoint.
- Reproduce or encode the manufacturing false positives identified by audit: NSF Biomechanics/Mechanobiology and broad CHEERS routes.
- Preserve official title/scope inputs as regression cases without hard-coding profile-specific outputs.

**Lincoln**

- Branch `lincoln-release-ui` from the same `origin/main` SHA.
- Confirm the current search error path, stage transition behavior, and `profileFieldOrigins` response shape.

### 0:10–1:20 — parallel implementation

#### Jacob: recommendation precision

1. Require a genuinely company-specific anchor before `Pursue now`:
   - a non-broad exact term in official title/scope; or
   - independent non-generic title and scope evidence across meaningful groups.
2. A single scope-only or broad normalized overlap must not produce `Pursue now`.
3. Add title/scope conflict handling for specialized domains absent from the company profile.
4. Prevent one underlying broad phrase from appearing to satisfy several independent evidence groups.
5. Keep the 100-point rubric, source contracts, eligibility ownership, and Luna downgrade-only boundary stable unless a narrowly justified change is required.
6. Add focused regressions for the observed false positives plus positive manufacturing/water/cyber cases and negative consumer/service holdouts.

Backend acceptance:

- Biomechanics/Mechanobiology is not a direct manufacturing `Pursue` route.
- Generic CHEERS records are not promoted by broad overlap.
- Valid manufacturing, water, and cyber routes survive.
- Consumer and adversarial service profiles remain honest no-match cases.
- Deterministic fallback remains credible without semantic review.

#### Lincoln: trust and transition fixes

Implement in this order:

1. **Search error state**
   - Keep confirmed profile data.
   - Show the actual safe error message.
   - Provide Retry and Edit profile actions.
   - Reserve no-match language for successful searches returning zero qualifying results.
2. **Stage transition behavior**
   - Scroll to the top of each new review, results, and workspace screen.
   - Programmatically focus the new primary heading without causing a second visual jump.
   - Respect normal reduced-motion behavior.
3. **Progress correction**
   - Intake is Step 1.
   - Confirmation/questions are Step 2.
   - Search/results are Step 3 where a step indicator is shown.
4. **Profile provenance**
   - Store `profileFieldOrigins` from bundle intake.
   - Distinguish extracted website/file evidence, founder-supplied text, unknown values, and founder-confirmed edits.
   - Founder edits update the displayed origin to founder-confirmed.
5. **Only if time remains**
   - Restore visible evidence-list markers.
   - Replace stale “Opportunity Map” wording with “Government Resource Finder” or context-specific language.
   - Sort saved opportunities by relevance rather than insertion order.

Frontend acceptance:

- 429/503/network failure cannot render the no-match screen.
- Retry reruns the confirmed profile search.
- Review/results/workspace open at and focus their primary heading.
- Confirmation no longer says Step 1.
- Populated fields do not all claim the same provenance.
- No additional layout system or decorative component is introduced.

### 1:20–1:40 — integrate once

1. Jacob pushes `jacob-match-precision`.
2. Lincoln commits and pushes `lincoln-release-ui`.
3. Merge both into one release candidate.
4. Resolve only actual integration conflicts; do not opportunistically refactor.
5. Run focused tests for the changed seams first.
6. Run the full suite, lint, TypeScript, production build, and `git diff --check` once on the exact merge candidate.

Do not repeatedly run the entire verifier suite during implementation. Use focused tests while coding; use the rigorous full gate on the integrated candidate. If the full gate finds independent issues, parallelize the fixes where safe and rerun only the failing checks before the final full gate.

### 1:40–2:00 — live smoke and deployment

Run five founder profiles through live sources:

- AI healthcare
- Advanced manufacturing
- Municipal water
- Cybersecurity
- Difficult consumer marketplace

For each, inspect:

- Titles and actual project scope
- Direct/verify/partner/watch route
- Eligibility concerns
- Deadline and amount
- Explanation evidence
- Official source URL
- Honest source/fallback status

Release criteria:

- No known audited false positive remains a direct `Pursue` route.
- Positive profiles retain at least one defensible path when the live source actually exposes one.
- Consumer/no-match and search-error states are visibly distinct.
- No test, lint, type, build, console, or route error blocks the flow.

Then fast-forward or merge the exact verified release candidate into `main` and push. The push will deploy automatically. Watch the GitHub deployment job and perform a short production smoke on the deployed SHA.

## Explicit cuts

Do not add during this pass:

- SAM.gov procurement integration
- Comparable-company claims or a peer-company graph
- Longitudinal agency analytics
- New adjacent-opportunity architecture
- A new funding-roadmap contract
- Full solicitation-attachment parsing
- Notice-specific task generation beyond existing supported data
- Accounts, email, calendar, settings, or help center
- Another UI redesign or large mobile-layout pass

Existing metadata such as `routeType`, `resultMeta`, and `typicalAwardAmount` may be surfaced after the release gate only if the live precision, error state, provenance, transitions, and exact candidate verification are already complete.

## Prompt for Jacob's agent

Send the following after the shared `main` push finishes:

> Pull the latest `origin/main` on Jacob's computer and read `TWO_HOUR_RELEASE_PLAN.md` completely before changing anything. Create and work only on `jacob-match-precision` from that exact main SHA. First run the Cloudflare checkpoint in the plan: `npx wrangler whoami` and `npx wrangler d1 migrations list WORKSPACE_DB --remote`; apply `0001_workspace.sql` only if it is actually pending. Then own only the backend recommendation-precision work: freeze the audited manufacturing false positives (NSF Biomechanics/Mechanobiology and broad CHEERS routes) as general regression cases, strengthen deterministic title/scope anchoring and conflict handling without hard-coding verifier outputs, preserve the downgrade-only Luna boundary, and protect positive manufacturing/water/cyber plus negative consumer/service holdouts. Use focused tests while implementing; do not repeatedly run the full verifier suite. Commit and push the backend branch, report the exact SHA and tests, and do not edit Lincoln's frontend files or merge to main yourself.

## Completion handoff

Each agent must report:

- Branch and exact commit SHA
- Files changed
- Focused tests run and results
- Any contract change
- Any remaining known false positive or regression
- Whether the Cloudflare migration list was empty or a migration was applied

Only the integrated, live-smoked SHA may become the final `main` release.
