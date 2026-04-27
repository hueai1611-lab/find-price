-- Optional BOQ / technical expansion aliases for better cross-wording retrieval
ALTER TABLE "boq_items" ADD COLUMN     "normalizedExpansionSearchText" TEXT NOT NULL DEFAULT '';
