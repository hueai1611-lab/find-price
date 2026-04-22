import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db/prisma';

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

  const pricePeriodCodes = rows
    .map((r) => r.pricePeriodCode)
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

  return NextResponse.json({ pricePeriodCodes });
}
