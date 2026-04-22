import * as XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/db/prisma";
import { buildHeaderMap } from "../lib/import/header-map";
import { parseBaseItem } from "../lib/import/parse-base-item";
import { parseQuarterPrices } from "../lib/import/parse-quarter-prices";

function toDecimalOrNull(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\./g, "").replace(/,/g, ".").trim();
  if (!cleaned || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned).toFixed(2);
}

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

async function main() {
  const filePath = path.join(
    repoRoot,
    "VH_XD31_VBLQ_Bo don gia (XD)_01.04.2026 (1).xlsx"
  );

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const headerRows = rows.slice(0, 3);
  const dataRows = rows.slice(3);

  const headerMap = buildHeaderMap(headerRows);

  console.log("Header map:", JSON.stringify(headerMap, null, 2));

  const importBatch = await prisma.importBatch.create({
    data: {
      fileName: path.basename(filePath),
      versionLabel: "01.04.2026",
      status: "processing",
      sheetNames: [sheetName],
      headerRowRange: "1-3",
      totalRowsDetected: rows.length,
    },
  });

  let importedItems = 0;
  let importedPrices = 0;

  for (let i = 0; i < Math.min(dataRows.length, 20); i++) {
    const row = dataRows[i];
    const sourceRowNumber = i + 4;

    const base = parseBaseItem(row, headerMap);

    if (base.rowType !== "item") continue;
    if (!base.noiDungCongViec && !base.quyCachKyThuat) continue;

    const searchText = [
      base.nhomCongTac,
      base.noiDungCongViec,
      base.quyCachKyThuat,
      base.yeuCauKhac,
      base.donVi,
      base.maHieuHsmt,
      base.maHieuKsg,
    ]
      .filter(Boolean)
      .join(" ");

    const normalizedSearchText = searchText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/\s+/g, " ")
      .trim();

    const item = await prisma.boqItem.create({
      data: {
        importBatchId: importBatch.id,
        sourceFileName: path.basename(filePath),
        sheetName,
        sourceRowNumber,
        versionLabel: "01.04.2026",

        stt: base.stt,
        ctxd: base.ctxd,
        maHieuHsmt: base.maHieuHsmt,
        maHieuKsg: base.maHieuKsg,
        nhomCongTac: base.nhomCongTac,
        noiDungCongViec: base.noiDungCongViec,
        quyCachKyThuat: base.quyCachKyThuat,
        yeuCauKhac: base.yeuCauKhac,
        donVi: base.donVi,
        nguoiThucHien: base.nguoiThucHien,

        rowType: base.rowType,
        sectionCode: base.sectionCode,
        subgroupCode: base.subgroupCode,
        isSearchable: true,

        rawStt: base.stt,
        rawCtxd: base.ctxd,
        rawMaHieuHsmt: base.maHieuHsmt,
        rawMaHieuKsg: base.maHieuKsg,
        rawNhomCongTac: base.nhomCongTac,
        rawNoiDungCongViec: base.noiDungCongViec,
        rawQuyCachKyThuat: base.quyCachKyThuat,
        rawYeuCauKhac: base.yeuCauKhac,
        rawDonVi: base.donVi,
        rawNguoiThucHien: base.nguoiThucHien,
        rawRowJson: base.rawRowJson as any,

        normalizedNhomCongTac: base.nhomCongTac?.toLowerCase() ?? null,
        normalizedNoiDungCongViec: base.noiDungCongViec?.toLowerCase() ?? null,
        normalizedQuyCachKyThuat: base.quyCachKyThuat?.toLowerCase() ?? null,
        normalizedYeuCauKhac: base.yeuCauKhac?.toLowerCase() ?? null,
        normalizedDonVi: base.donVi?.toLowerCase() ?? null,
        normalizedMaHieuHsmt: base.maHieuHsmt?.toLowerCase() ?? null,
        normalizedMaHieuKsg: base.maHieuKsg?.toLowerCase() ?? null,

        searchText,
        normalizedSearchText,
      },
    });

    importedItems++;

    const prices = parseQuarterPrices(row, headerMap);

    for (const p of prices) {
      const hasAnyValue =
        p.vatTu || p.thiCong || p.tongCong || p.linkHdThamKhao || p.ghiChu;

      if (!hasAnyValue) continue;

      await prisma.boqItemPrice.create({
        data: {
          boqItemId: item.id,
          pricePeriodCode: p.pricePeriodCode,
          pricePeriodLabel: p.pricePeriodLabel,
          vatTu: toDecimalOrNull(p.vatTu) as any,
          thiCong: toDecimalOrNull(p.thiCong) as any,
          tongCong: toDecimalOrNull(p.tongCong) as any,
          linkHdThamKhao: p.linkHdThamKhao,
          ghiChu: p.ghiChu,
          rawVatTu: p.vatTu,
          rawThiCong: p.thiCong,
          rawTongCong: p.tongCong,
          rawLinkHdThamKhao: p.linkHdThamKhao,
          rawGhiChu: p.ghiChu,
        },
      });

      importedPrices++;
    }
  }

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: "completed",
      totalRowsImported: importedItems,
      totalItemsCreated: importedItems,
      totalItemPricesCreated: importedPrices,
    },
  });

  console.log({
    importedItems,
    importedPrices,
    importBatchId: importBatch.id,
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });