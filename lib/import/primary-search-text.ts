/**
 * Primary search blob: nhóm + nội dung + quy — same pipeline as `scripts/import-demo.ts`.
 * Keep in sync when changing import normalization.
 */

export function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").trim();
}

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNormalizedPrimarySearchText(item: {
  nhomCongTac?: string | null;
  noiDungCongViec?: string | null;
  quyCachKyThuat?: string | null;
}): string {
  return normalizeSearchText(
    buildSearchText([item.nhomCongTac, item.noiDungCongViec, item.quyCachKyThuat])
  );
}
