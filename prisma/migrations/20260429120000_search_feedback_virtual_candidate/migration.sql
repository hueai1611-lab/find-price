-- Virtual candidate marker for no-suitable learning rows (not a BOQ id).
ALTER TABLE "search_feedback" ADD COLUMN "virtualCandidateKey" TEXT;

UPDATE "search_feedback"
SET "virtualCandidateKey" = '__NO_SUITABLE_RESULT__'
WHERE "action" = 'no_suitable_result' AND "virtualCandidateKey" IS NULL;
