<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Government Opportunity Map Rules

## Active planning authority
- Read `TWO_HOUR_RELEASE_PLAN.md` before starting project work.
- That release plan supersedes this file's historical ownership/branch assignments and all older plans' scope order, verification cadence, Cloudflare work, and next-step decisions.
- The product goal and non-negotiable safety rules below remain active.

## Product goal
Build a founder-first Government Opportunity Map that turns a verified company profile into defensible government opportunities and one persistent application workspace.

## Historical ownership — deprecated
- Jacob owns founder-facing UI, profile review, application workspace presentation, deployment, browser QA, and merges.
- Lincoln owns government source adapters, normalization, terminology, hard eligibility checks, matching, historical joins, persistence logic, and backend tests.
- `main` must remain deployable.
- Jacob owns shared contracts, dependencies, lockfiles, Cloudflare configuration, and final merges.

## Historical branches — deprecated
- `main`: deployable integration branch
- `jacob-ui`: Jacob and Codex only
- `lincoln-data`: Lincoln and Cursor only

## Non-negotiable rules
- Do not manually hard-code opportunity outputs for any official test case.
- All five official profiles must use the same pipeline.
- Government facts come only from validated official records.
- AI never decides hard eligibility, deadlines, scores, or historical totals.
- Unknown critical eligibility caps a result at Potential Fit.
- Current opportunities and historical awards remain separate.
- Every displayed official fact carries source ID, URL, and retrieval time.
- Unsupported application fields remain blank and become founder questions.
- No direct government-form submission in the hackathon build.
- Do not add sources, models, packages, or architecture without agreement.
- Never place secrets in client code, prompts, logs, screenshots, or commits.

## Core before extras
P0 is website/manual/PDF intake, verified profile, Grants.gov, USAspending, deterministic matching, strict disqualifiers, honest no-match, one application-prefill workspace, persistence, five-case fixtures, and production/local fallback.

OAuth, email, calendar sync, settings, help chat, mascot animation, dashboards, and extra sources are not allowed until P0 passes twice.
