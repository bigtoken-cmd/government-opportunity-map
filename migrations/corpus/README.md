# Corpus D1 (`CORPUS_DB`)

Dedicated opportunity corpus database — closest Cloudflare equivalent to FundPath’s separate Firestore `corpus` collection. Keeps program/award data out of `WORKSPACE_DB`.

## Create (once, on an authenticated machine)

```bash
npx wrangler d1 create government-opportunity-map-corpus
```

Then add to `wrangler.jsonc`:

```jsonc
{
  "binding": "CORPUS_DB",
  "database_name": "government-opportunity-map-corpus",
  "database_id": "<id from create output>"
}
```

Do not invent a fake `database_id` in git — that breaks deploys.

## Planned tables (Phase 1)

- `opportunities` — open/forecasted/curated programs
- `awards` — USAspending / historical rows
- `utah_resources` — “who to call” directory
- `corpus_meta` — sync stats

Schema SQL lands in this folder in Phase 1.
