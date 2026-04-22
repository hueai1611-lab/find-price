# Architecture

## 1. Overview

This project is a fullstack web application for smart search over BOQ / NSGT / đơn giá / vật tư construction data imported from Excel files.

The architecture is intentionally designed to be practical and maintainable for phase 1.

The system should be built as a search-first business application, not as an AI-first architecture.

Because the real Excel source contains:
- multi-row headers
- repeated quarter-based pricing groups
- hierarchy-like rows such as section, subgroup, and item
- separate business fields and price-period fields

the import architecture must separate:
1. base BOQ item data
2. quarter / period-specific pricing data

This means the import model is no longer:

`Excel row -> boq_item`

It should now be:

`Excel row -> parse row type -> base item + quarter price children`

---

## 2. Technology stack

### Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend
- Next.js route handlers and/or server actions
- TypeScript business logic in `/lib`

### Database
- PostgreSQL

### ORM
- Prisma

### Validation
- Zod where appropriate

### Scripts
- Node-based import scripts first
- architecture should allow future replacement or extension with Python if Excel complexity requires it

---

## 3. Architecture principles

### Keep phase 1 simple
The first release should use a straightforward monolithic architecture inside a single Next.js project.

### Separate concerns
- UI belongs in `/app` and `/components`
- business logic belongs in `/lib`
- schema and DB definitions belong in `/prisma`
- import / maintenance tooling belongs in `/scripts`
- documentation belongs in `/docs`

### Keep the search core understandable
Ranking and search behavior must be deterministic and debuggable.

### Preserve future upgrade paths
The design should allow future additions such as:
- better ranking tuning
- learning memory
- semantic search
- AI-assisted query handling

But these should not complicate phase 1.

---

## 4. High-level system flow

### Import flow
Excel file  
-> detect multi-row header  
-> map base columns  
-> map repeated quarter groups  
-> classify row type  
-> create `boq_items`  
-> create `boq_item_prices` per quarter  
-> generate search text  
-> store import metadata

### Search flow
User query  
-> query normalization  
-> synonym expansion  
-> search execution against searchable BOQ items  
-> ranking  
-> selected price period resolution  
-> result shaping  
-> UI response

### Batch flow
Batch input  
-> split into rows  
-> per-row normalization  
-> search execution  
-> ranking  
-> selected price period mapping  
-> output table / export

---

## 5. Proposed folder structure

```txt
app/
  search/
  batch/
  admin/
  api/

components/

lib/
  db/
  normalize/
  search/
  ranking/
  import/
  mapping/

prisma/

scripts/
  import_excel/

docs/