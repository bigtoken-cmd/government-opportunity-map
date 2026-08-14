# Government Opportunity Map

A founder-first product that turns a verified company profile into defensible government opportunities, clear next actions, and a persistent application workspace.

## Core journey

1. Add a public company website, one PDF, or manual company text.
2. Review the extracted company profile and answer only critical missing questions.
3. Search official government sources through isolated server-side adapters.
4. Apply deterministic disqualifiers and transparent matching rules.
5. Review up to five defensible routes, or an honest no-strong-match result.
6. Open one application workspace with source-backed prefilled fields and a persistent checklist.

## Core sources

- Grants.gov for current and forecasted opportunities
- USAspending for historical awards and government-customer evidence

Current opportunities and historical awards are always labeled separately. This product is a research aid, not a definitive eligibility determination.

## Stack

- Next.js 16 and TypeScript
- Cloudflare Workers through the OpenNext adapter
- Cloudflare D1 for founder workspaces and checklist persistence
- Cloudflare R2 only if private raw-document retention becomes necessary
- OpenAI Responses API with strict structured outputs for profile extraction and grounded wording
- Bundled same-day official fixtures for the five supplied test cases

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

Never commit API keys or Cloudflare secrets. Use local environment files and Cloudflare environment bindings.

## Ownership

- Jacob: founder-facing UI, profile review, application workspace presentation, deployment, browser QA, and merges
- Lincoln: source adapters, normalization, terminology, hard checks, matching, history, persistence logic, and backend tests

See `AGENTS.md` before using a coding agent.
