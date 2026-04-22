import type { SearchResult } from "./search-types";

const MAX_LEN = 220;

/**
 * One-line summary for table display: nhóm · nội dung · quy (trimmed, capped).
 */
export function buildShortResultSummary(r: SearchResult): string {
  const parts = [
    (r.nhomCongTac ?? "").trim(),
    (r.noiDungCongViec ?? "").trim(),
    (r.quyCachKyThuat ?? "").trim(),
  ].filter(Boolean);
  const s = parts.join(" · ");
  if (!s) return "—";
  if (s.length <= MAX_LEN) return s;
  return `${s.slice(0, MAX_LEN - 1)}…`;
}
