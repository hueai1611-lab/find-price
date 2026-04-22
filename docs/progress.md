# Progress

## Current phase
Phase 1 MVP — iterating on import + search against real BOQ Excel.

## Done (high level)
- PostgreSQL + Prisma models/migrations for BOQ items and per-quarter prices
- Excel import path (`scripts/import-demo.ts`, `lib/import/*`) including normalized blobs
- Search API (`GET /api/search`) and `lib/search/search-service.ts`: **lexical** retrieval on **`normalizedPrimarySearchText`** first, **`normalizedSearchText`** as **fallback**, with **deterministic** ranking and **rule-based technical** checks in `lib/search/technical-match.ts`
- Primary BOQ fields for intent: **`nhomCongTac`**, **`noiDungCongViec`**, **`quyCachKyThuat`**; **`yeuCauKhac`** treated as **secondary** (guards so it cannot carry a row alone)
- Search data scope: **latest completed `import_batch` only** (not all historical batches)
- Internal row inspect: **`/app/inspect/row`** (server reads workbook; no client `file://` to local `.xlsx`)
- Internal search UI: table-style best row + separate “all hits” page
- Backfill script for empty `normalizedPrimarySearchText` on legacy rows (`scripts/backfill-normalized-primary-search-text.ts`)

## Doing
- Ranking and UX hardening on real queries; docs alignment

## Next (examples)
- Multi-line / batch input: one best row per search line in the UI
- Optional: more results per query, logging, synonym tooling — only where needed

## Risks
- Excel layout and Vietnamese number formatting edge cases
- Technical tokens (cm, D…) and ranking quality on noisy queries

## Notes
Keep phase 1 simple: no Elasticsearch, no vector DB, no chatbot-first approach.
