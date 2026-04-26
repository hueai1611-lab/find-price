-- Step 1 foundations for linked-formula daily output:
-- - Singleton app settings for quarter master shared root path
-- - Source column location for tongCong (per BoqItemPrice)

CREATE TABLE "app_settings" (
  "id" TEXT NOT NULL,
  "quarterMasterSharedRootPath" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "boq_item_prices"
ADD COLUMN "sourceTongCongCol" INTEGER;

