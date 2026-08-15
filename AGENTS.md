<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Government Opportunity Map

Turn a founder-supplied website, file, or description into defensible government opportunities and one application workspace.

## Model stage instructions

Each Luna or research stage loads rules from `src/lib/agents/`:

- `intake-extraction.md` — map evidence onto company profile fields
- `semantic-review.md` — downgrade-only official-scope review
- `research-query.md` — Grants.gov query agent
- `research-listing.md` — listing-page scrape and similar-opportunity IDs
- `research-historical.md` — USAspending / SBIR historical agent
- `research-prefill.md` — listing-aware application prefill
- `explanation-wording.md` — later wording pass over deterministic packets

Runtime code imports the same text from `src/lib/agents/instructions.ts`.

## Safety

- Do not hard-code opportunity outputs for official test profiles.
- All profiles use the same pipeline.
- Government facts come only from validated official records.
- Models never decide hard eligibility, deadlines, scores, or historical totals.
- Research agents may retrieve, extract, and propose. They may not upgrade a Skip into Pursue or invent facts.
- Inferred profile fields are tagged `inferred`. Summarized description is tagged `summarized`.
- Unknown critical eligibility caps a result at Potential Fit.
- Current opportunities and historical awards stay separate.
- Every displayed official fact carries source ID, URL, and retrieval time.
- Unsupported application fields stay blank.
- No direct government-form submission.
- Never place secrets in client code, prompts, logs, screenshots, or commits.

Local development: `npm install` then `npm run dev`. `OPENAI_API_KEY` belongs in `.env.local` only.
