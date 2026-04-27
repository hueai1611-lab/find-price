-- CreateTable
CREATE TABLE "search_feedback" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "pricePeriodCode" TEXT,
    "action" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_feedback_normalizedQuery_idx" ON "search_feedback"("normalizedQuery");

-- CreateIndex
CREATE INDEX "search_feedback_boqItemId_idx" ON "search_feedback"("boqItemId");

-- CreateIndex
CREATE INDEX "search_feedback_normalizedQuery_boqItemId_idx" ON "search_feedback"("normalizedQuery", "boqItemId");

-- AddForeignKey
ALTER TABLE "search_feedback" ADD CONSTRAINT "search_feedback_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
