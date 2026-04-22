import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db/prisma';

/** Matches `select: { pricePeriodCode: true }` on `ImportBatch`. */
type PricePeriodCodeRow = { pricePeriodCode: string | null };

/**
 * Distinct quarter codes from completed imports (one file = one batch row with period).
 * Legacy batches with null `pricePeriodCode` are omitted.
 */
export async function GET() {
  const rows = await prisma.importBatch.findMany({
    where: {
      completedAt: { not: null },
      pricePeriodCode: { not: null },
    },
    select: { pricePeriodCode: true },
    distinct: ['pricePeriodCode'],
    orderBy: { pricePeriodCode: 'asc' },
  });

  const pricePeriodCodes = (rows as unknown as PricePeriodCodeRow[])
    .map((r) => r.pricePeriodCode)
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

  return NextResponse.json({ pricePeriodCodes });
}
