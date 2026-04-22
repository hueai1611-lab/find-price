# Requirements

## 1. Project overview

Smart Search is a web application for searching construction BOQ / NSGT / đơn giá / vật tư data imported from Excel source files.

The application is intended to support QS / Estimation workflows by helping users quickly find the most relevant standard item from a large pricing database, even when the input keyword is incomplete, inconsistent, or slightly incorrect.

This is not a chatbot-first product.  
The primary goal is to build a practical search and mapping tool with strong ranking and batch processing capabilities.

---

## 2. Business goals

The product should help users:

- find the correct work item faster
- reduce manual lookup and copy-paste work
- standardize search results across teams
- accelerate estimation, budgeting, and quotation workflows
- improve consistency in mapping user-entered descriptions to standard internal data

---

## 3. Primary users

Main users may include:

- QS staff
- estimators
- cost planning staff
- tender and contract teams
- internal admin users who manage source data and synonyms

---

## 4. Source data

The system uses Excel files as the source of truth for pricing and BOQ-related data.

Typical source data may contain fields such as:

- mã hiệu
- số thứ tự
- tên công việc
- mô tả kỹ thuật / spec
- vật liệu / thương hiệu
- đơn vị
- đơn giá vật tư
- đơn giá thi công
- đơn giá tổng
- ghi chú
- nhóm công việc

The source Excel files may contain:
- multiple sheets
- merged cells
- inconsistent formatting
- blank cells caused by layout design
- Vietnamese number formatting
- repeated headers or grouped rows

The application must be able to import, normalize, and store this data reliably.

---

## 5. Core product scope

### 5.1 Single search
Users can enter a single keyword or natural work description and receive the most relevant matching items.

Examples:
- cửa nhôm kính xingfa 55
- trần thạch cao chịu ẩm
- sơn ngoài trời jotun
- chống thấm hố pit thang máy
- khe đứng 100x20 sika

The system should search across multiple fields, not just one title column.

### 5.2 Batch search
Users can paste or upload a list of search lines and process them in batch.

Examples:
- cửa thép chống cháy
- sơn epoxy
- lan can kính
- cửa nhôm xingfa
- trần chịu ẩm

The system should return a structured table with top matches and scores for each input row.

### 5.3 Output mapping
When a match is found, the system should return mapped fields such as:
- mã hiệu
- tên công việc chuẩn
- đơn vị
- đơn giá tham chiếu
- nhóm công việc
- ghi chú
- confidence / score

### 5.4 Synonym support
The system should support equivalent terms and aliases.

Examples:
- thạch cao = gypsum
- điều hòa = AC
- cửa cuốn = rolling shutter
- coppha = coffa = cốp pha

### 5.5 Fuzzy support
The system should tolerate minor misspellings and typing variations.

Examples:
- xingfha -> xingfa
- epoxi -> epoxy
- cua nhom -> cửa nhôm

### 5.6 Search logs and feedback
The system should store search logs and support future learning from user-selected matches.

This learning capability may be introduced in later phases.

---

## 6. Functional requirements

### FR-01 Excel import
Admin users must be able to import source Excel data into the system.

Expected capabilities:
- upload file
- identify source file name
- assign version / label if needed
- parse rows from selected sheets
- preserve import batch metadata
- capture import errors at row level where possible

### FR-02 Data normalization
The system must normalize imported data into a consistent searchable structure.

Normalization may include:
- lowercasing
- trimming spaces
- punctuation cleanup
- Vietnamese diacritic normalization
- searchable text generation
- numeric conversion
- unit normalization

### FR-03 Multi-field search
The system must search across multiple fields, including where available:
- tên công việc
- spec / mô tả kỹ thuật
- vật liệu / thương hiệu
- đơn vị
- ghi chú
- nhóm công việc

### FR-04 Ranking
The system must rank search results based on relevance.

Ranking should consider:
- exact match
- phrase match
- keyword overlap
- spec relevance
- synonym match
- fuzzy match
- field importance

### FR-05 Batch processing
The system must support batch search for multiple input rows and return structured results.

### FR-06 Result detail
The system should allow the user to inspect a result and see the underlying source fields that produced the match.

### FR-07 Synonym management
Admin users should be able to add, edit, and delete synonyms / aliases used during search.

### FR-08 Search logging
The system should log searches for monitoring and future improvement.

### FR-09 Feedback capture
The system should support storing user selections or corrections for future ranking improvements.

This may be simple in phase 1 and expanded later.

---

## 7. Search behavior requirements

The system should support the following search patterns:

### Exact match
If the query exactly matches a known work item name or phrase, the system should strongly prefer that result.

### Partial match
If the query only contains part of the work item description, the system should still return good results.

### Multi-keyword match
If the query contains multiple terms, the system should evaluate overlap across relevant fields.

### Spec-aware match
If the query includes technical clues like dimensions, material types, or product names, the system should use them during ranking.

### Synonym-expanded match
The system should expand query meaning using known aliases and equivalent terms.

### Fuzzy rescue
If the input contains small spelling errors, the system should still attempt to find the intended result.

---

## 8. Non-functional requirements

### Performance
Target phase-1 performance:
- single search should feel near-instant for normal datasets
- dataset size expectation: around 10,000 rows initially
- batch processing should support practical usage for several hundred rows

Exact SLA can be refined later, but the application should be designed for responsiveness.

### Maintainability
The codebase must be easy to understand, update, and extend.

### Traceability
Imported rows should remain traceable back to source file and batch where possible.

### Transparency
Ranking logic should be understandable and not fully opaque.

### Safety
Raw imported values and normalized values should be preserved separately.

---

## 9. Phase 1 scope

Phase 1 should include:

- basic Excel import flow
- normalized database storage
- search across main fields
- ranking based on lexical / field-aware scoring
- synonym support
- fuzzy support
- single search page
- batch search page
- admin synonym page
- basic import and search logging

Phase 1 should not depend on:
- embeddings
- vector database
- semantic AI architecture
- chatbot interface

---

## 10. Future scope

Possible future phases may include:

- learning memory from user-selected matches
- stronger search analytics
- semantic search
- AI-assisted query expansion
- AI-generated summaries or explanations
- import version comparison
- approval workflow for reviewed mappings

These are not required for the initial build unless explicitly requested.

---

## 11. Success criteria

The project will be considered successful if users can:

- import Excel data reliably
- search with realistic Vietnamese construction terms
- find relevant standard items quickly
- process batch search in a usable way
- receive mapped output fields consistently
- manage synonyms and improve search behavior over time