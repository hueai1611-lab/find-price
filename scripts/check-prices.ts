import { prisma } from "../lib/db/prisma";

async function main() {
  const batch = await prisma.importBatch.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!batch) {
    console.log("No import batches found.");
    return;
  }

  const prices = await prisma.boqItemPrice.findMany({
    where: { boqItem: { importBatchId: batch.id } },
    orderBy: [{ boqItemId: "asc" }, { pricePeriodCode: "asc" }],
    select: {
      pricePeriodCode: true,
      pricePeriodLabel: true,
      vatTu: true,
      thiCong: true,
      tongCong: true,
      linkHdThamKhao: true,
      ghiChu: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        importBatchId: batch.id,
        priceRowCount: prices.length,
        prices,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
