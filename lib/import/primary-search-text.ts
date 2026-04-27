import { buildBoqExpansionSuffix } from "../search/boq-search-expand";
import { normalizeBaseSearchString } from "../search/boq-search-normalize";

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

/**
 * Nhóm + nội dung + quy, same `normalizeBaseSearchString` as keyword search
 * (diameter + technical glue + diacritics off).
 */
export function buildNormalizedPrimarySearchText(item: {
  nhomCongTac?: string | null;
  noiDungCongViec?: string | null;
  quyCachKyThuat?: string | null;
}): string {
  return normalizeBaseSearchString(
    buildSearchText([item.nhomCongTac, item.noiDungCongViec, item.quyCachKyThuat])
  );
}

/** Token aliases (btct, dul, d400 phrases) derived from the normalized primary only. */
export function buildNormalizedExpansionSearchText(item: {
  nhomCongTac?: string | null;
  noiDungCongViec?: string | null;
  quyCachKyThuat?: string | null;
}): string {
  return buildBoqExpansionSuffix(buildNormalizedPrimarySearchText(item));
}
