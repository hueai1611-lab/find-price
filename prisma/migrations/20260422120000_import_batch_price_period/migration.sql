-- One quarter per import file: record chosen period on the batch.
ALTER TABLE "import_batches" ADD COLUMN     "pricePeriodCode" TEXT,
ADD COLUMN "pricePeriodLabel" TEXT;
