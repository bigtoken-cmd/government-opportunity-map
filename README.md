# Government Opportunity Map

A founder-first research aid. Supply a website, a PDF/DOCX/PPTX file, or a written description. The app extracts a company profile, searches official government sources, and opens one application workspace. It does not submit government forms or make eligibility determinations.

## Attribution

Matching-route architecture, eligibility/sequencing patterns, and corpus ideas are adapted from **[FundPath](https://fundpath.dev)** by [Juan Lizarazo](https://github.com/juanlizarazo) ([ai-builder-2026-fundpath](https://github.com/juanlizarazo/ai-builder-2026-fundpath)), built for AI Builder Day 2026 / the GOEO challenge. Juan cleared a fork for this project; that upstream repo is not MIT-licensed — treat it as attributed source material, not a license grant beyond what he stated. Our UI, multi-input intake, Cloudflare hosting, and Luna model stages are our own work.

Implementation sequencing for the FundPath-style backend lives in [`plan.md`](./plan.md).

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` with `OPENAI_API_KEY` for intake extraction and research. The key is server-only. Never use `NEXT_PUBLIC_*` or commit the value.

```bash
npm test
npm run preview   # Cloudflare Workers preview
```

Production deploys from `main` to Cloudflare Workers via GitHub Actions.

## Model stages

Instructions for each model stage live in `src/lib/agents/` and are loaded at runtime from `src/lib/agents/instructions.ts`.
