import { prisma } from "../lib/db/prisma";

async function main() {
  const count = await prisma.boqItem.count();
  console.log("boq_items count =", count);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });