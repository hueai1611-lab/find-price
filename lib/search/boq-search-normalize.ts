import { applyBoqDiameterCanonicalForms } from "./boq-diameter-normalize";

/** Lexical normalization for measurements (keep in sync across search-service + calculate-score). */
function normalizeTechnicalForms(s: string): string {
  return s
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\b(\d+)\s+cm\b/gi, "$1cm")
    .replace(/\bD\s*(\d+)\b/gi, "d$1")
    .replace(/\bD(\d+)\s*-\s*D(\d+)\b/gi, "D$1-D$2")
    /** Steel grades: cb400-v, cb500-v → cb400v (hyphen variation). */
    .replace(/\b(cb\d{3})\s*-\s*([a-z])\b/gi, (_m, a: string, b: string) => `${a}${b}`.toLowerCase())
    /** DN tokens: dn100 / DN100 spacing variants. */
    .replace(/\bdn\s*(\d{2,4})\b/gi, (_m, n: string) => `dn${n}`)
    /** Planar sizes: 600 x 100 → 600x100 (weak technical match + retrieval consistency). */
    .replace(/\b(\d{2,4})\s*x\s*(\d{2,4})\b/gi, "$1x$2")
    /** KT / kích thước prefix glued to following dim token. */
    .replace(/\b(kt|kich\s+thuoc)\s+(\d{2,4}x\d{2,4})\b/gi, "kt $2");
}

/**
 * Single pipeline for user query and for building stored primary text:
 * lower, strip tones, đ→d, collapse space, technical glue, then diameter canon.
 */
export function normalizeBaseSearchString(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
  return applyBoqDiameterCanonicalForms(normalizeTechnicalForms(base));
}
