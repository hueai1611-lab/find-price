-- Phase 2: optional boqItemId, query signature, context fields, FK on delete SET NULL.

ALTER TABLE "search_feedback" DROP CONSTRAINT "search_feedback_boqItemId_fkey";

ALTER TABLE "search_feedback" ALTER COLUMN "boqItemId" DROP NOT NULL;

ALTER TABLE "search_feedback" ADD COLUMN "querySignature" TEXT;
ALTER TABLE "search_feedback" ADD COLUMN "resultBoqItemIds" JSONB;
ALTER TABLE "search_feedback" ADD COLUMN "resultCount" INTEGER;
ALTER TABLE "search_feedback" ADD COLUMN "selectedRank" INTEGER;

CREATE INDEX "search_feedback_querySignature_idx" ON "search_feedback"("querySignature");

ALTER TABLE "search_feedback" ADD CONSTRAINT "search_feedback_boqItemId_fkey"
  FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
