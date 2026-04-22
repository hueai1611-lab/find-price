# AGENTS.md

# Smart Search Project Guide

This repository is for a web app that provides smart search for BOQ / NSGT / đơn giá / vật tư dữ liệu xây dựng imported from Excel files.

The assistant must treat this project as a practical business application for QS / Estimation workflows, not as an AI demo project.

---

## 1. Product goal

Build a maintainable web app that can:

1. Import Excel source data for BOQ / NSGT / đơn giá / vật tư
2. Normalize Vietnamese construction terminology
3. Support single search and batch search
4. Rank exact, partial, fuzzy, and synonym matches
5. Return mapped result fields such as:
   - mã hiệu
   - tên công việc chuẩn
   - đơn vị
   - đơn giá tham chiếu
   - nhóm công việc
   - ghi chú
6. Preserve a path for future upgrades:
   - learning memory
   - semantic search
   - AI-assisted query understanding

---

## 2. Phase priorities

### Phase 1 priority

Focus on a stable, practical search engine first.

Must-have in phase 1:

- Excel import
- normalized storage
- lexical search
- fuzzy search
- synonym expansion
- ranking
- single search UI
- batch search UI
- admin synonym management
- import logs / basic search logs

### Phase 2

- better scoring and ranking tuning
- learning memory from user selections
- better import validation
- import versioning improvements
- logs and analytics

### Phase 3

- semantic search
- AI query expansion
- AI summary / explanation layer

Do not prematurely introduce phase-3 architecture in phase 1.

---

## 3. Tech stack

Use the following stack unless explicitly instructed otherwise:

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- shadcn/ui

Preferred support tools:

- Zod for validation
- React Hook Form for forms if needed
- server actions or route handlers where appropriate

Do not introduce a different stack without clear justification.

---

## 4. Architecture principles

### Keep the architecture simple

Prefer simple, maintainable solutions over clever or over-engineered ones.

### Phase 1 architecture target

- Excel as source input only
- PostgreSQL as primary database
- Prisma for DB access
- Search logic implemented in application layer plus PostgreSQL search support
- No separate microservices unless explicitly requested

### Avoid heavy architecture too early

Do not introduce any of the following unless explicitly asked:

- Elasticsearch
- OpenSearch
- Meilisearch
- vector databases
- Redis queues
- event-driven architecture
- microservices
- LangChain-style orchestration
- chatbot-first architecture

This project needs a strong search core first.

---

## 5. Working rules for the agent

### Planning first

- Always propose a plan before changing more than 2 files
- Always explain the intended file changes before implementing medium or large tasks
- For larger features, first inspect the codebase and propose a step-by-step implementation plan

### Scope control

- Do not rewrite unrelated files
- Do not refactor unrelated areas
- Keep changes focused on the requested task
- If the request is ambiguous, ask clarifying questions or provide assumptions clearly

### Explain important logic before implementation

For the following areas, explain the logic before coding:

- ranking / scoring
- search query expansion
- synonym handling
- import parsing strategy
- database schema changes

### Preserve project stability

- Prefer backwards-compatible changes
- Avoid broad renaming unless requested
- Avoid introducing hidden magic behavior
- Keep business behavior explicit and testable

---

## 6. Folder responsibilities

Use these responsibilities when creating or modifying files.

### `/app`

UI routes, pages, route handlers, and app-level orchestration.

Examples:

- `/app/search` for single search UI
- `/app/batch` for batch search UI
- `/app/admin` for admin pages
- `/app/api` for route handlers when needed

### `/components`

Reusable UI components only.

Examples:

- search form
- result cards
- score badge
- import table
- batch result grid

Avoid placing business logic here.

### `/lib`

All core business logic belongs here.

Subfolders:

- `/lib/db` database helpers and Prisma wrapper
- `/lib/normalize` text normalization and token utilities
- `/lib/search` query preparation, search orchestration, result shaping
- `/lib/ranking` scoring and ranking logic

### `/prisma`

Prisma schema and migrations.

### `/scripts`

Import and maintenance scripts.

Examples:

- Excel import utilities
- backfill scripts
- rebuild scripts

### `/docs`

Project documentation.

Examples:

- requirements
- architecture
- data dictionary
- progress notes

---

## 7. Coding rules

### Type safety

- Write strongly typed TypeScript
- Avoid `any` unless absolutely necessary
- Prefer explicit types for search results, ranking results, import rows, and API responses

### Function design

- Prefer small, composable functions
- Keep functions focused on one responsibility
- Avoid deeply nested logic when possible
- Extract shared utilities into `/lib`

### Naming

- Use clear and descriptive names
- Prefer domain language that matches the business context
- Keep naming consistent with existing docs and schema

Examples:

- `normalizeText`
- `expandSynonyms`
- `calculateMatchScore`
- `searchItems`
- `parseImportRow`

### Comments

- Add comments only where logic is non-obvious
- Do not add noisy comments for trivial code
- Prefer readable code over excessive comments

### Validation

- Validate inputs at boundaries
- Validate API input
- Validate import rows
- Validate admin form input
- Use Zod where helpful

### Error handling

- Fail clearly
- Return useful error messages
- Preserve row-level import errors where possible
- Never silently swallow important failures

---

## 8. Data handling rules

### Preserve raw and normalized data separately

For imports, preserve:

- raw imported field values
- normalized / derived field values

Do not overwrite original source values with normalized values.

### Prefer explicit searchable fields

Items should eventually support fields like:

- raw source fields
- normalized text
- search text
- derived tokens
- group/category if available
- import batch metadata
- source file / version metadata

### Numeric handling

Be careful with Vietnamese number formats from Excel.
Do not assume formatting without checking.
Preserve correct numeric conversion for:

- giá vật tư
- giá thi công
- giá tổng
- quantities and dimensions where applicable

### Import safety

- Import logic must be traceable
- Keep row-level context for debugging
- Prefer storing import batch metadata
- Support future rebuilds without losing source traceability

---

## 9. Search design rules

### Phase 1 search strategy

Phase 1 should use a practical hybrid of:

- lexical matching
- field-aware scoring
- fuzzy matching
- synonym expansion

Do not use embeddings in phase 1 unless explicitly asked.

### Search fields

Search should consider multiple fields, depending on available data:

- tên công việc
- spec / mô tả kỹ thuật
- vật liệu / thương hiệu
- đơn vị
- ghi chú
- nhóm công việc

### Search behavior expectations

The system should handle:

- exact match
- partial match
- multi-keyword match
- fuzzy misspellings
- synonym / alias expansion
- mixed Vietnamese typing styles

### Query normalization

User search queries should usually be normalized through:

- lowercasing
- trimming spaces
- punctuation cleanup
- Vietnamese diacritic removal or comparable normalization
- synonym expansion
- preserving dimension-like tokens such as `100x20mm`, `D110`, `DN100`

---

## 10. Ranking rules

Ranking is central to this project.

### Before implementing ranking

Always explain:

- ranking inputs
- scoring dimensions
- bonuses
- penalties
- confidence thresholds

### Phase 1 ranking should prefer

1. exact phrase match in main work name
2. strong keyword overlap in main work name
3. relevant spec / material matches
4. synonym-expanded matches
5. fuzzy rescue for minor misspellings

### Ranking output

Where reasonable, ranking should provide:

- final score
- confidence label
- score breakdown for debugging or admin use

Example confidence buckets:

- Exact Match
- Strong Match
- Near Match
- Related Match

### Ranking implementation

Keep ranking deterministic and understandable.
Avoid black-box scoring logic in phase 1.

---

## 11. Batch search rules

Batch search is a first-class feature, not an afterthought.

### Expected behavior

- accept multiline input or uploaded rows
- process each input independently
- return top match and optionally alternatives
- include score and confidence level
- support export

### Batch output fields

Prefer outputs such as:

- original keyword
- normalized keyword
- top result
- score
- confidence
- mapped fields
- possible alternatives
- needs review flag

### Performance mindset

Implement batch processing in a way that is practical and responsive for phase 1.
Avoid architecture that is too complex for current scale.

---

## 12. UI rules

### UI principles

- clean and functional
- business-first, not marketing/demo style
- prioritize readability and workflow speed
- avoid overly decorative UI

### Pages expected in phase 1

- single search page
- batch search page
- admin synonym page
- import/admin page if included
- item detail or result detail view if useful

### Reusable UI

Put reusable UI in `/components`.
Do not place ranking or search logic inside components.

---

## 13. Database and Prisma rules

### Schema changes

- Explain schema changes before implementing them
- Keep model names and fields clear and business-oriented
- Prefer additive migrations when possible

### Expected models in phase 1

These are likely models, though actual names can vary:

- `boq_items`
- `import_batches`
- `synonyms`
- `search_logs`
- `user_feedback`

### Prisma usage

- keep Prisma access centralized
- avoid duplicate DB helper code
- prefer clear query functions over scattered raw SQL
- if raw SQL is needed for search, isolate it carefully and document it

---

## 14. Testing rules

Testing is important for this project because search can appear correct while being wrong.

### Test the important logic

Prioritize tests for:

- Vietnamese text normalization
- tokenization
- synonym expansion
- ranking calculations
- edge cases for search scoring
- import row parsing for malformed data

### When adding non-trivial logic

Add tests or at least propose test cases.

### Do not skip edge cases

Examples:

- empty input
- repeated whitespace
- no-diacritic input
- typo input
- mixed order keywords
- dimensions and size tokens
- missing spec or missing unit
- invalid numeric import values

---

## 15. Documentation rules

Keep documentation aligned with implementation.

### Update docs when needed

If architecture, schema, or behavior changes significantly, update:

- `docs/requirements.md`
- `docs/architecture.md`
- `docs/data-dictionary.md`
- `docs/progress.md`

### Prefer concise documentation

Keep docs practical and focused on the project.

---

## 16. Preferred workflow when responding to a task

When handling a feature request, use this pattern:

1. Inspect relevant files
2. Summarize understanding
3. Propose a plan
4. Mention files to create or change
5. Explain important logic if needed
6. Implement focused changes
7. Suggest tests or validation steps
8. Summarize what changed

For larger tasks, do not jump straight into code.

---

## 17. What the agent should avoid

Do not:

- over-engineer phase 1
- introduce AI-heavy tooling too early
- add new infrastructure without justification
- move business logic into UI components
- mix normalization, search, and ranking into one giant file
- silently change domain terminology
- refactor unrelated parts of the codebase
- optimize prematurely in ways that reduce clarity

---

## 18. Preferred response style from the agent

When helping in this repository, the agent should:

- be practical
- be explicit
- explain assumptions
- keep plans structured
- prefer maintainable solutions
- avoid unnecessary jargon
- be cautious with search and ranking logic

When uncertain, propose options with tradeoffs instead of guessing.

---

## 19. Project-specific reminder

This app is primarily a smart search and mapping tool for construction estimation workflows.

In phase 1, prioritize:

- correctness
- maintainability
- transparent ranking
- usable admin workflows
- practical batch processing

Not:

- AI theatrics
- experimental abstractions
- unnecessary infrastructure

---

## 20. Default instruction for any major change

Before making a major change, the agent should first answer:

1. What is the goal?
2. What files will change?
3. Why is this the simplest suitable approach?
4. What are the risks?
5. How can we verify it works?

Only then proceed to implementation.
