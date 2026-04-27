/**
 * Learning-only virtual candidate — safe to import from Client Components (no Prisma/pg).
 */
export const VIRTUAL_NO_SUITABLE_CANDIDATE_KEY = "__NO_SUITABLE_RESULT__";

/** True if `boqItemId` must never be stored or joined as a real BOQ row id. */
export function isReservedVirtualFeedbackBoqId(
  boqItemId: string | null | undefined,
): boolean {
  return (boqItemId ?? "").trim() === VIRTUAL_NO_SUITABLE_CANDIDATE_KEY;
}
