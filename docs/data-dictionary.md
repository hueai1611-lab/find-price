# Data Dictionary

## 1. Overview

This document defines the main application data structures for the Smart Search project.

The exact Prisma model names may vary slightly during implementation, but the business meaning should remain consistent.

The system must preserve both:
- raw imported source values
- normalized / derived values used for search and ranking

The current Excel source structure includes:
- multi-row headers
- repeated price groups by quarter / period
- hierarchy-like rows such as section, subgroup, and item rows
- business columns for search such as:
  - CTXD
  - Mã hiệu (HSMT)
  - Mã hiệu (KSG)
  - Nhóm công tác
  - Nội dung công việc
  - Quy cách kỹ thuật
  - Yêu cầu khác
  - Đơn vị
  - Người thực hiện
- repeated pricing blocks such as:
  - Vật tư
  - Thi công
  - Tổng cộng
  - Link HĐ tham khảo (CKS)
  - Ghi chú

Because of this structure, the system should separate:
1. the base BOQ item data
2. the price data by quarter / price period

---

## 2. Main entities

Expected core entities:

- BOQ item
- BOQ item price
- import batch
- synonym
- search log
- user feedback

Optional future entities:
- learned mapping
- import row error
- item group dictionary
- source file registry
- price period dictionary

---

## 3. BOQ item

Represents one logical searchable row/item from imported Excel BOQ or pricing data.

This table stores the base business meaning of the item, independent from any specific quarter-based price.

### Suggested table/model name
`boq_items`

### Core identity and traceability fields

#### `id`
- type: string or numeric primary key
- description: internal unique identifier

#### `import_batch_id`
- type: foreign key
- description: links the item to the import batch that created it

#### `source_file_name`
- type: string
- description: original file name for traceability

#### `sheet_name`
- type: string
- description: sheet name from the source Excel file

#### `source_row_number`
- type: integer
- description: original row number in Excel if available

#### `version_label`
- type: string, optional
- description: logical version label such as `01.04.2026` if used for the whole workbook import

---

## 4. BOQ item business fields

These fields describe the row itself.

#### `stt`
- type: string, optional
- description: display sequence or row label from source Excel

#### `ctxd`
- type: string, optional
- description: CTXD code if available in source

#### `ma_hieu_hsmt`
- type: string, optional
- description: Mã hiệu (HSMT)

#### `ma_hieu_ksg`
- type: string, optional
- description: Mã hiệu (KSG)

#### `nhom_cong_tac`
- type: string, optional
- description: work group / category from source

#### `noi_dung_cong_viec`
- type: string, optional
- description: main work item description; this is usually the most important search field

#### `quy_cach_ky_thuat`
- type: string, optional
- description: technical specification or detailed description

#### `yeu_cau_khac`
- type: string, optional
- description: additional requirements or conditions

#### `don_vi`
- type: string, optional
- description: unit of measure such as m2, md, bộ, cái

#### `nguoi_thuc_hien`
- type: string, optional
- description: source value for person / role responsible if present

---

## 5. BOQ item row hierarchy fields

The source Excel may contain section rows, subgroup rows, and detail item rows.

These fields help classify and preserve structure.

#### `row_type`
- type: string
- description: classification of the row
- expected values:
  - `section`
  - `subgroup`
  - `item`

#### `section_code`
- type: string, optional
- description: section-level code if applicable, for example `TC.8`

#### `subgroup_code`
- type: string, optional
- description: subgroup-level code if applicable, for example `8.1`, `8.2`

#### `parent_label`
- type: string, optional
- description: optional textual parent grouping label from source hierarchy

#### `is_searchable`
- type: boolean
- description: indicates whether this row should appear in search results
- typical behavior:
  - section rows: false
  - subgroup rows: false or limited
  - item rows: true

---

## 6. BOQ item raw fields

These fields help preserve source fidelity.

#### `raw_stt`
- type: string, optional
- description: original STT value before normalization

#### `raw_ctxd`
- type: string, optional
- description: original CTXD value before normalization

#### `raw_ma_hieu_hsmt`
- type: string, optional
- description: original HSMT code before normalization

#### `raw_ma_hieu_ksg`
- type: string, optional
- description: original KSG code before normalization

#### `raw_nhom_cong_tac`
- type: string, optional
- description: original work group value before normalization

#### `raw_noi_dung_cong_viec`
- type: string, optional
- description: original work item content before normalization

#### `raw_quy_cach_ky_thuat`
- type: string, optional
- description: original technical spec before normalization

#### `raw_yeu_cau_khac`
- type: string, optional
- description: original additional requirement before normalization

#### `raw_don_vi`
- type: string, optional
- description: original unit text before normalization

#### `raw_nguoi_thuc_hien`
- type: string, optional
- description: original executor / responsible value before normalization

#### `raw_row_json`
- type: json, optional
- description: raw structured representation of the imported row for debugging and traceability

---

## 7. BOQ item normalized / derived search fields

These fields support search and ranking.

#### `normalized_nhom_cong_tac`
- type: string, optional
- description: normalized work group text

#### `normalized_noi_dung_cong_viec`
- type: string, optional
- description: normalized work item text

#### `normalized_quy_cach_ky_thuat`
- type: string, optional
- description: normalized technical spec text

#### `normalized_yeu_cau_khac`
- type: string, optional
- description: normalized additional requirement text

#### `normalized_don_vi`
- type: string, optional
- description: normalized unit value

#### `normalized_ma_hieu_hsmt`
- type: string, optional
- description: normalized HSMT code for exact code matching

#### `normalized_ma_hieu_ksg`
- type: string, optional
- description: normalized KSG code for exact code matching

#### `search_text`
- type: string
- description: combined text used for broad search candidate retrieval

#### `normalized_search_text`
- type: string
- description: normalized combined search text

#### `keyword_tokens`
- type: json or text, optional
- description: token list extracted for search / debugging

#### `dimension_tokens`
- type: json or text, optional
- description: preserved tokens like `100x20mm`, `D110`, `DN100`

#### `brand_tokens`
- type: json or text, optional
- description: extracted material / brand indicators if detectable from content/spec

#### `code_tokens`
- type: json or text, optional
- description: extracted code-like values such as HSMT/KSG identifiers

#### `is_active`
- type: boolean
- description: whether the item is active for search

#### `created_at`
- type: datetime
- description: record creation time

#### `updated_at`
- type: datetime
- description: record update time

### Suggested `search_text` composition
`search_text` should generally be built from:
- `nhom_cong_tac`
- `noi_dung_cong_viec`
- `quy_cach_ky_thuat`
- `yeu_cau_khac`
- `don_vi`
- `ma_hieu_hsmt`
- `ma_hieu_ksg`

---

## 8. BOQ item price

Represents the pricing block of one BOQ item for one specific price period / quarter.

This table should store the repeated pricing groups from the Excel source.

### Suggested table/model name
`boq_item_prices`

### Fields

#### `id`
- type: primary key
- description: internal identifier

#### `boq_item_id`
- type: foreign key
- description: links the price row to its base BOQ item

#### `price_period_code`
- type: string
- description: machine-friendly period code, for example:
  - `Q2_Q3_2025`
  - `Q4_2025`
  - `Q1_2026`
  - `Q2_2026`

#### `price_period_label`
- type: string
- description: display label from source, for example:
  - `Quý II+III.25`
  - `Quý IV.25`
  - `Quý I.26`
  - `Quý II.26`

#### `vat_tu`
- type: decimal / numeric, optional
- description: material price for this period

#### `thi_cong`
- type: decimal / numeric, optional
- description: labor / installation price for this period

#### `tong_cong`
- type: decimal / numeric, optional
- description: total price for this period

#### `link_hd_tham_khao`
- type: string, optional
- description: source link field for reference contract / CKS

#### `ghi_chu`
- type: string, optional
- description: note associated with this period price

#### `raw_vat_tu`
- type: string, optional
- description: original imported material price value before conversion

#### `raw_thi_cong`
- type: string, optional
- description: original imported labor price value before conversion

#### `raw_tong_cong`
- type: string, optional
- description: original imported total price value before conversion

#### `raw_link_hd_tham_khao`
- type: string, optional
- description: original imported link text before normalization

#### `raw_ghi_chu`
- type: string, optional
- description: original imported note before normalization

#### `created_at`
- type: datetime
- description: record creation time

#### `updated_at`
- type: datetime
- description: record update time

---

## 9. Import batch

Represents one import execution from an Excel file.

### Suggested table/model name
`import_batches`

### Fields

#### `id`
- type: primary key
- description: internal batch identifier

#### `file_name`
- type: string
- description: uploaded file name

#### `version_label`
- type: string, optional
- description: logical version of the data import

#### `status`
- type: string
- description: import status such as pending, processing, completed, failed

#### `sheet_names`
- type: json or text, optional
- description: list of processed sheet names

#### `header_row_range`
- type: string, optional
- description: identifies header rows used during parsing, for example `1-3`

#### `total_rows_detected`
- type: integer, optional
- description: number of source rows detected

#### `total_rows_imported`
- type: integer, optional
- description: number of rows successfully imported

#### `total_rows_failed`
- type: integer, optional
- description: number of rows that failed parsing or validation

#### `total_items_created`
- type: integer, optional
- description: count of `boq_items` created

#### `total_item_prices_created`
- type: integer, optional
- description: count of `boq_item_prices` created

#### `error_summary`
- type: text, optional
- description: summarized import error info

#### `started_at`
- type: datetime, optional
- description: import start time

#### `completed_at`
- type: datetime, optional
- description: import end time

#### `created_at`
- type: datetime
- description: batch record creation time

---

## 10. Optional import row error

This entity is optional but useful for debugging Excel parsing problems.

### Suggested table/model name
`import_row_errors`

### Fields

#### `id`
- type: primary key
- description: internal identifier

#### `import_batch_id`
- type: foreign key
- description: related import batch

#### `sheet_name`
- type: string, optional
- description: source sheet name

#### `source_row_number`
- type: integer, optional
- description: source Excel row number

#### `error_code`
- type: string
- description: short parser / validation error code

#### `error_message`
- type: text
- description: readable error explanation

#### `raw_row_json`
- type: json, optional
- description: raw row snapshot for debugging

#### `created_at`
- type: datetime
- description: creation time

---

## 11. Synonym

Represents a search alias, equivalent term, or canonical mapping.

### Suggested table/model name
`synonyms`

### Fields

#### `id`
- type: primary key
- description: internal identifier

#### `term`
- type: string
- description: user-facing term or alias

#### `normalized_term`
- type: string
- description: normalized form of the alias

#### `canonical_term`
- type: string
- description: canonical term used for expansion or grouping

#### `group_name`
- type: string, optional
- description: synonym group label

#### `language_code`
- type: string, optional
- description: optional language marker if needed later

#### `domain_group`
- type: string, optional
- description: optional business grouping such as:
  - waterproofing
  - aluminum_glass
  - mep
  - finishing
  - structure

#### `is_active`
- type: boolean
- description: whether this synonym is active

#### `notes`
- type: string, optional
- description: admin note about why the synonym exists

#### `created_at`
- type: datetime
- description: creation time

#### `updated_at`
- type: datetime
- description: update time

### Example meanings
- term: `coffa`
- canonical_term: `cốp pha`

- term: `gypsum`
- canonical_term: `thạch cao`

---

## 12. Search log

Represents a search action performed by a user or session.

### Suggested table/model name
`search_logs`

### Fields

#### `id`
- type: primary key
- description: internal identifier

#### `query`
- type: string
- description: original user-entered query

#### `normalized_query`
- type: string, optional
- description: normalized form of the query

#### `expanded_query_json`
- type: json, optional
- description: synonym-expanded or token-expanded query data

#### `search_mode`
- type: string, optional
- description: single or batch

#### `selected_price_period_code`
- type: string, optional
- description: period used to shape output pricing

#### `top_result_item_id`
- type: foreign key, optional
- description: item id of top-ranked result

#### `top_result_price_id`
- type: foreign key, optional
- description: selected price row for output, if applicable

#### `top_score`
- type: decimal / numeric, optional
- description: score of top-ranked result

#### `confidence_label`
- type: string, optional
- description: Exact Match / Strong Match / Near Match / Related Match

#### `result_count`
- type: integer, optional
- description: total number of returned candidate results

#### `response_ms`
- type: integer, optional
- description: time taken to process the search

#### `created_at`
- type: datetime
- description: search timestamp

---

## 13. User feedback

Represents user correction or confirmation of a search result.

### Suggested table/model name
`user_feedback`

### Fields

#### `id`
- type: primary key
- description: internal identifier

#### `search_log_id`
- type: foreign key, optional
- description: related search log

#### `query`
- type: string, optional
- description: original query if stored redundantly for convenience

#### `selected_item_id`
- type: foreign key
- description: item that the user selected or confirmed

#### `selected_price_id`
- type: foreign key, optional
- description: price period row selected for output

#### `feedback_type`
- type: string
- description: values like selected, confirmed, rejected, corrected

#### `notes`
- type: string, optional
- description: optional explanation from admin or user

#### `created_at`
- type: datetime
- description: feedback timestamp

---

## 14. Optional future entity: learned mapping

This entity is optional and may be added later if learning behavior becomes more advanced.

### Suggested table/model name
`learned_mappings`

### Purpose
Store repeated query-to-item selections to boost future ranking.

### Example fields
- `id`
- `normalized_query`
- `item_id`
- `price_period_code`
- `selection_count`
- `last_selected_at`
- `weight`

---

## 15. Search result contract

This is not necessarily a database table, but it is a useful application-level structure.

### Suggested shape

#### `item_id`
- matched BOQ item id

#### `price_id`
- matched BOQ item price id for the selected period

#### `stt`
- display sequence if available

#### `ctxd`
- mapped CTXD code if available

#### `ma_hieu_hsmt`
- mapped HSMT code if available

#### `ma_hieu_ksg`
- mapped KSG code if available

#### `nhom_cong_tac`
- display work group

#### `noi_dung_cong_viec`
- main display name of the result

#### `quy_cach_ky_thuat`
- display spec if available

#### `don_vi`
- mapped unit

#### `price_period_code`
- machine-friendly price period used for output

#### `price_period_label`
- display price period used for output

#### `vat_tu`
- mapped material price for selected period

#### `thi_cong`
- mapped labor price for selected period

#### `tong_cong`
- mapped total price for selected period

#### `link_hd_tham_khao`
- mapped reference link for selected period

#### `ghi_chu`
- mapped note for selected period

#### `score`
- final ranking score

#### `confidence_label`
- Exact Match / Strong Match / Near Match / Related Match

#### `score_breakdown`
- optional structured breakdown for debugging

#### `highlights`
- optional list of matched clues such as:
  - exact phrase in work content
  - group keyword matched
  - spec keyword matched
  - code match used
  - synonym expansion used
  - fuzzy rescue used

---

## 16. Notes on implementation

### Raw vs normalized
Always preserve both raw and normalized values where practical.

### Searchability
Not every field must be directly shown to the end user, but searchable fields must be clearly defined.

### Numeric fields
Use numeric/decimal types for prices, not strings.

### Price storage
Do not store quarter-based prices directly on `boq_items` as separate fixed columns if the system is expected to evolve.
Prefer storing repeated price groups in `boq_item_prices`.

### Traceability
Records should be traceable back to source file, sheet, and row where possible.

### Flexibility
The schema should remain flexible enough to support later additions such as:
- import version comparison
- learning memory
- semantic metadata
- admin review states
- additional price periods in future source files