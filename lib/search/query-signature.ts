import { normalizeBaseSearchString } from "./boq-search-normalize";
import { normalizeSearchQuery } from "./feedback-query-normalize";

/**
 * Weak stopwords (ASCII) — input is reduced via the same pipeline as feedback lookup.
 */
const WEAK_STOPWORDS = new Set([
  "va",
  "cua",
  "cho",
  "bang",
  "loai",
  "cac",
  "theo",
  /** Catalogue noise (KT / kích thước) — keep numeric dims only. */
  "kt",
]);

const MATERIAL_TOKENS = new Set([
  "gach",
  "porcelain",
  "ceramic",
  "granite",
  "betong",
  "btct",
  "bttp",
  "vxm",
  "mesh",
]);

function glueDimensionsInAscii(s: string): string {
  let out = s;
  out = out.replace(
    /\b(\d{2,4})\s+x\s+(\d{2,4})\s+x\s+(\d{2,4})\b/gi,
    "$1x$2x$3"
  );
  out = out.replace(/\b(\d{2,4})\s+x\s+(\d{2,4})\b/gi, "$1x$2");
  return out;
}

function mergeBeTong(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i]!.toLowerCase();
    const b = tokens[i + 1]?.toLowerCase();
    if (a === "be" && b === "tong") {
      out.push("betong");
      i++;
      continue;
    }
    out.push(tokens[i]!);
  }
  return out;
}

function isTechnicalToken(low: string): boolean {
  if (MATERIAL_TOKENS.has(low)) return true;
  if (/^\d+x\d+(x\d+)?$/.test(low)) return true;
  if (/^\d{2,}$/.test(low)) return true;
  if (/^d\d{2,4}$/.test(low)) return true;
  if (/^phi\d{2,4}$/.test(low)) return true;
  if (/^cb\d{3}[a-z0-9.-]*$/.test(low)) return true;
  if (/^m\d{2,4}$/.test(low)) return true;
  if (/^b\d{2}([._]\d+)?$/.test(low)) return true;
  return false;
}

/**
 * Lightweight clustering key (no AI): ASCII key → glue dims → drop weak tokens →
 * keep technical / material / longer tokens → sort unique with `|`.
 */
export function buildQuerySignature(query: string): string {
  const key = normalizeBaseSearchString(normalizeSearchQuery(query)).trim();
  if (!key) return "";
  const glued = glueDimensionsInAscii(key);
  const raw = glued
    .split(/\s+/)
    .map((t) => t.replace(/^[,;:.'"]+|[,;:.'"]+$/g, "").trim())
    .filter(Boolean);
  const merged = mergeBeTong(raw);
  const kept = new Set<string>();
  for (const t of merged) {
    const low = t.toLowerCase();
    if (!low || WEAK_STOPWORDS.has(low)) continue;
    if (isTechnicalToken(low)) {
      kept.add(low);
      continue;
    }
    if (low.length >= 4) kept.add(low);
  }
  return Array.from(kept).sort((a, b) => a.localeCompare(b)).join("|");
}
