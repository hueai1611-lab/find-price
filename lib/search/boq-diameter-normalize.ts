/**
 * Diameter / size-like tokens → canonical `d{nnn}` (lowercase) for search matching.
 * Run on already diacritics-removed, lowercased, whitespace-collapsed text.
 * Conservative rules to avoid turning unrelated mm counts into diameters.
 */

const RE_D_PREFIX = /(?<![a-z0-9])[dD]\s*(\d{2,4})(?![0-9])/g;
const RE_PHI_ASCII = /\bphi\s*(\d{2,4})(?![0-9])\b/gi;
const RE_DIAM_SYMBOL = /[øØ⌀Φϕ]\s*(\d{2,4})(?![0-9])/g;
const RE_DUONG_KINH = /\bduong\s*kinh\s*(\d{2,4})(?:\s*mm)?(?![0-9])/gi;

/** Typical pile / element OD in mm (300–999) used as bare `Nnn mm` (not sheet thickness 10–30). */
const RE_BARE_3_DIGIT_MM = /\b([3-9]\d{2})\s*mm(?![a-z0-9])/gi;

/**
 * Rebar / bar diameters sometimes written as plain `10mm`, `16 mm`.
 * Only normalize a small whitelist to avoid turning generic thicknesses into diameter tokens.
 */
const ALLOWED_SMALL_MM = new Set<number>([
  6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 50,
]);
const RE_SMALL_MM = /\b(\d{1,2})\s*mm(?![a-z0-9])/gi;

export function applyBoqDiameterCanonicalForms(s: string): string {
  let t = s;
  t = t.replace(RE_PHI_ASCII, "d$1");
  t = t.replace(RE_DIAM_SYMBOL, "d$1");
  t = t.replace(RE_DUONG_KINH, "d$1");
  t = t.replace(RE_BARE_3_DIGIT_MM, "d$1");
  t = t.replace(RE_SMALL_MM, (_m, raw: string) => {
    const n = parseInt(raw, 10);
    return ALLOWED_SMALL_MM.has(n) ? `d${n}` : _m;
  });
  t = t.replace(RE_D_PREFIX, "d$1");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
