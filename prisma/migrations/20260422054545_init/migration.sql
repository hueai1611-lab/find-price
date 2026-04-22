-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "versionLabel" TEXT,
    "status" TEXT NOT NULL,
    "sheetNames" JSONB,
    "headerRowRange" TEXT,
    "totalRowsDetected" INTEGER,
    "totalRowsImported" INTEGER,
    "totalRowsFailed" INTEGER,
    "totalItemsCreated" INTEGER,
    "totalItemPricesCreated" INTEGER,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_items" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "sourceRowNumber" INTEGER,
    "versionLabel" TEXT,
    "stt" TEXT,
    "ctxd" TEXT,
    "maHieuHsmt" TEXT,
    "maHieuKsg" TEXT,
    "nhomCongTac" TEXT,
    "noiDungCongViec" TEXT,
    "quyCachKyThuat" TEXT,
    "yeuCauKhac" TEXT,
    "donVi" TEXT,
    "nguoiThucHien" TEXT,
    "rowType" TEXT NOT NULL,
    "sectionCode" TEXT,
    "subgroupCode" TEXT,
    "parentLabel" TEXT,
    "isSearchable" BOOLEAN NOT NULL DEFAULT true,
    "rawStt" TEXT,
    "rawCtxd" TEXT,
    "rawMaHieuHsmt" TEXT,
    "rawMaHieuKsg" TEXT,
    "rawNhomCongTac" TEXT,
    "rawNoiDungCongViec" TEXT,
    "rawQuyCachKyThuat" TEXT,
    "rawYeuCauKhac" TEXT,
    "rawDonVi" TEXT,
    "rawNguoiThucHien" TEXT,
    "rawRowJson" JSONB,
    "normalizedNhomCongTac" TEXT,
    "normalizedNoiDungCongViec" TEXT,
    "normalizedQuyCachKyThuat" TEXT,
    "normalizedYeuCauKhac" TEXT,
    "normalizedDonVi" TEXT,
    "normalizedMaHieuHsmt" TEXT,
    "normalizedMaHieuKsg" TEXT,
    "searchText" TEXT NOT NULL,
    "normalizedSearchText" TEXT NOT NULL,
    "keywordTokens" JSONB,
    "dimensionTokens" JSONB,
    "brandTokens" JSONB,
    "codeTokens" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_item_prices" (
    "id" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "pricePeriodCode" TEXT NOT NULL,
    "pricePeriodLabel" TEXT NOT NULL,
    "vatTu" DECIMAL(18,2),
    "thiCong" DECIMAL(18,2),
    "tongCong" DECIMAL(18,2),
    "linkHdThamKhao" TEXT,
    "ghiChu" TEXT,
    "rawVatTu" TEXT,
    "rawThiCong" TEXT,
    "rawTongCong" TEXT,
    "rawLinkHdThamKhao" TEXT,
    "rawGhiChu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boq_item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_errors" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sheetName" TEXT,
    "sourceRowNumber" INTEGER,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "rawRowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synonyms" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "canonicalTerm" TEXT NOT NULL,
    "groupName" TEXT,
    "languageCode" TEXT,
    "domainGroup" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT,
    "expandedQueryJson" JSONB,
    "searchMode" TEXT,
    "selectedPricePeriodCode" TEXT,
    "topResultItemId" TEXT,
    "topResultPriceId" TEXT,
    "topScore" DECIMAL(8,2),
    "confidenceLabel" TEXT,
    "resultCount" INTEGER,
    "responseMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_feedback" (
    "id" TEXT NOT NULL,
    "searchLogId" TEXT,
    "query" TEXT,
    "selectedItemId" TEXT NOT NULL,
    "selectedPriceId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boq_items_importBatchId_idx" ON "boq_items"("importBatchId");

-- CreateIndex
CREATE INDEX "boq_items_rowType_idx" ON "boq_items"("rowType");

-- CreateIndex
CREATE INDEX "boq_items_isSearchable_idx" ON "boq_items"("isSearchable");

-- CreateIndex
CREATE INDEX "boq_items_isActive_idx" ON "boq_items"("isActive");

-- CreateIndex
CREATE INDEX "boq_items_ctxd_idx" ON "boq_items"("ctxd");

-- CreateIndex
CREATE INDEX "boq_items_maHieuHsmt_idx" ON "boq_items"("maHieuHsmt");

-- CreateIndex
CREATE INDEX "boq_items_maHieuKsg_idx" ON "boq_items"("maHieuKsg");

-- CreateIndex
CREATE INDEX "boq_item_prices_boqItemId_idx" ON "boq_item_prices"("boqItemId");

-- CreateIndex
CREATE INDEX "boq_item_prices_pricePeriodCode_idx" ON "boq_item_prices"("pricePeriodCode");

-- CreateIndex
CREATE INDEX "import_row_errors_importBatchId_idx" ON "import_row_errors"("importBatchId");

-- CreateIndex
CREATE INDEX "synonyms_normalizedTerm_idx" ON "synonyms"("normalizedTerm");

-- CreateIndex
CREATE INDEX "synonyms_canonicalTerm_idx" ON "synonyms"("canonicalTerm");

-- CreateIndex
CREATE INDEX "synonyms_isActive_idx" ON "synonyms"("isActive");

-- CreateIndex
CREATE INDEX "search_logs_searchMode_idx" ON "search_logs"("searchMode");

-- CreateIndex
CREATE INDEX "search_logs_selectedPricePeriodCode_idx" ON "search_logs"("selectedPricePeriodCode");

-- CreateIndex
CREATE INDEX "user_feedback_searchLogId_idx" ON "user_feedback"("searchLogId");

-- CreateIndex
CREATE INDEX "user_feedback_selectedItemId_idx" ON "user_feedback"("selectedItemId");

-- CreateIndex
CREATE INDEX "user_feedback_feedbackType_idx" ON "user_feedback"("feedbackType");

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_item_prices" ADD CONSTRAINT "boq_item_prices_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_topResultItemId_fkey" FOREIGN KEY ("topResultItemId") REFERENCES "boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_topResultPriceId_fkey" FOREIGN KEY ("topResultPriceId") REFERENCES "boq_item_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_searchLogId_fkey" FOREIGN KEY ("searchLogId") REFERENCES "search_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_selectedItemId_fkey" FOREIGN KEY ("selectedItemId") REFERENCES "boq_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_selectedPriceId_fkey" FOREIGN KEY ("selectedPriceId") REFERENCES "boq_item_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
