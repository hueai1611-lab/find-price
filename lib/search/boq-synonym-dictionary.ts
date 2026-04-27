/**
 * Compact BOQ / construction synonym groups (search layer only).
 * Matching is on diacritics-stripped, lowercased text (same as `normalizeBaseSearchString`).
 */

export type BoqSynonymGroup = {
  /** Stable id for debug / docs (optional). */
  id?: string;
  /** Short + phrase aliases to append to expansion / cross-match. */
  inject: string[];
  /** Patterns on normalized (ASCII) text. */
  match: RegExp[];
};

/**
 * When any `match` hits, missing `inject` terms may be added to expansion
 * (deduped, capped). Used for both BOQ row expansion and query token growth.
 */
export const BOQ_SYNONYM_GROUPS: readonly BoqSynonymGroup[] = [
  {
    id: "btct",
    inject: ["btct", "be tong cot thep"],
    match: [/\bbtct\b/gi, /\bbe\s+tong\s+cot\s+thep\b/gi],
  },
  {
    id: "bttp",
    inject: ["bttp", "be tong thuong pham"],
    match: [/\bbttp\b/gi, /\bbe\s+tong\s+thuong\s+pham\b/gi],
  },
  {
    id: "dul_coc",
    /**
     * Cọc DUL / BTCT — từ Q2_2026 + small-Book3 (ép cọc ống, dự ứng lực, DUL).
     */
    inject: [
      "dul",
      "du ung luc",
      "ep coc",
      "coc ong",
      "coc ong be tong",
      "coc ong btct",
      "ong coc du ung luc",
    ],
    match: [
      /\bdul\b/gi,
      /\bdu\s+ung\s+luc\b/gi,
      /\bep\s+coc\b/gi,
      /\bep\s+am\s+coc\b/gi,
      /\bcoc\s+ong\b/gi,
      /\bcoc\s+btct\b/gi,
    ],
  },
  {
    id: "vxm",
    inject: ["vxm", "vua xi mang", "vua xm", "xm mac"],
    match: [/\bvxm\b/gi, /\bvua\s+xi\s+mang\b/gi, /\bvua\s+xm\b/gi, /\bxm\s+mac\b/gi],
  },
  {
    inject: ["mesh", "luoi thep han"],
    match: [/\bmesh\b/gi, /\bluoi\s+thep\s+han\b/gi],
  },
  {
    inject: ["dat cap 1", "dat cap i"],
    match: [/\bdat\s+cap\s*1\b/gi, /\bdat\s+cap\s+i\b/gi],
  },
  {
    inject: ["b20", "mac 250"],
    match: [/\bmac\s*250\b/gi, /\bb20\b/gi, /\bcap\s+b20\b/gi],
  },
  {
    inject: ["b22.5", "mac 300", "b225"],
    match: [/\bmac\s*300\b/gi, /\bb22[._]5\b/gi, /\bb225\b/gi, /\bcap\s+b22[._]5\b/gi],
  },
  {
    inject: ["m75", "mac 75"],
    match: [/\bm75\b/gi, /\bmac\s*75\b/gi],
  },
  {
    /** Spelling: li tô / lito (common in roofing) */
    inject: ["lito", "li to"],
    match: [/\blito\b/gi, /\bli\s+to\b/gi],
  },
  {
    /** Regional spelling: trát / trét (plaster). Keep tight. */
    inject: ["trat", "tret"],
    match: [/\btrat\b/gi, /\btret\b/gi],
  },
  {
    id: "tile_material",
    /** Finishing / tile materials — cross-alias only within this family. */
    inject: [
      "porcelain",
      "granite",
      "ceramic",
      "gach op lat",
      "to dam",
      "gach ta",
      "granite ceramic",
    ],
    match: [
      /\bporcelain\b/gi,
      /\bgranite\b/gi,
      /\bceramic\b/gi,
      /\bgach\s+op\b/gi,
      /\bgach\s+lat\b/gi,
    ],
  },
  {
    /** small-Book3: “lắp dựng” (lỗi gõ) ↔ lắp đặt. */
    inject: ["lap dat", "len lap", "thao lap"],
    match: [/\blap\s+dung\b/gi, /\blap\s+dat\b/gi],
  },
  {
    /** Q2_2026: nắp hố ga, song chắn rác. */
    inject: ["nap ho ga", "song chan rac", "tieu ho ga", "ho ga composite"],
    match: [/\bnap\s+ho\s+ga\b/gi],
  },
  {
    /** Q2_2026: sơn tĩnh điện / sơn bột. */
    inject: ["son tinh dien", "son bot", "son bot tinh dien", "son nuoc"],
    match: [/\bson\s+tinh\s+dien\b/gi, /\bson\s+bot\b/gi],
  },
  {
    /** Cửa NK (nhựa) — hay gặp trong BĐG. */
    inject: ["cua nk", "cua nhua", "cua loi thep", "cua go"],
    match: [/\bcua\s+nk\b/gi, /\bcua\s+nhua\b/gi],
  },
  {
    /** Đổ / dùng bê tông (dự toán). */
    inject: ["do be tong", "dung be tong", "betong tuoi"],
    match: [/\bdo\s+be\s+tong\b/gi, /\bdung\s+be\s+tong\b/gi],
  },
  {
    inject: ["phu kien", "phu kien lap rap", "linh kien phu"],
    match: [/\bphu\s+kien\b/gi],
  },
  {
    inject: ["duong kinh", "phi", "ong duong kinh"],
    match: [/\bduong\s+kinh\b/gi, /\bphi\s*\d{2,4}\b/gi],
  },
  {
    /** Kết cấu / công tác BTCT (bigram “cong btct” trong BĐG). */
    inject: ["btct", "ket cau be tong", "dam btct", "san btct"],
    match: [/\bcong\s+btct\b/gi, /\bket\s+cau\s+btct\b/gi],
  },
  {
    inject: ["hoan thien", "hoan tat"],
    match: [/\bhoan\s+thien\b/gi],
  },
  {
    inject: ["ss400", "thep hop chat", "thep tam", "ma kem"],
    match: [/\bss400\b/gi],
  },
  {
    id: "van_chuyen",
    /** Vận chuyển nội bộ / đến công trường (Q2_2026). */
    inject: ["van chuyen", "van tai", "luu chuyen noi bo"],
    match: [/\bvan\s+chuyen\b/gi, /\bvan\s+chuyen\s+den\b/gi],
  },
  {
    id: "op_lat_cross",
    /** Ốp / lát / gạch — cách gọi tương đương trong BĐG. */
    inject: ["op lat", "op gach", "lat gach", "op tuong", "lat nen"],
    match: [/\bop\s+gach\b/gi, /\bop\s+lat\b/gi, /\blat\s+gach\b/gi, /\bgach\s+op\b/gi],
  },
  {
    id: "dap_dat",
    inject: ["dap dat", "dao dat", "dao va", "dat dao"],
    match: [/\bdap\s+dat\b/gi],
  },
  {
    id: "len_vien",
    /** Len / viền tường — cùng họ nẹp/viền (chỉ khi khớp cụm hẹp). */
    inject: ["vien tuong", "len tuong", "vien chan tuong", "nep tuong"],
    match: [/\blen\s+tuong\b/gi, /\blen\s+chan\b/gi],
  },
  {
    id: "tru_op",
    inject: ["op tru", "vien tru", "op cot"],
    match: [/\bvien\s+tru\b/gi, /\bop\s+tru\b/gi],
  },
  {
    id: "thuy_luc",
    inject: ["thuy luc", "may ep thuy luc", "ep thuy luc"],
    match: [/\bthuy\s+luc\b/gi],
  },
  {
    id: "cdt_cap_gach",
    inject: ["cdt cap gach", "chu dau tu cap gach", "cap gach"],
    match: [/\bcdt\s+cap\s+gach\b/gi, /\bchu\s+dau\s+tu\s+cap\s+gach\b/gi],
  },
  {
    id: "da_granite",
    inject: ["da granite", "da tu nhien", "granite tu nhien"],
    match: [/\bda\s+granite\b/gi, /\bda\s+tu\s+nhien\b/gi],
  },
  {
    id: "thao_do",
    inject: ["thao do", "pha do", "thao go"],
    match: [/\bthao\s*do\b/gi, /\bpha\s*do\b/gi],
  },
  {
    id: "cb_hyphen_grade",
    inject: ["cb400v", "cb500v", "cb300v", "cb240t"],
    match: [/\bcb\s*400\s*-\s*v\b/gi, /\bcb\s*500\s*-\s*v\b/gi, /\bcb\s*300\s*-\s*v\b/gi],
  },
] as const;

/** Structural / work-object tokens (tones stripped) for scoring. */
export const BOQ_STRUCTURAL_TOKENS = new Set<string>([
  "coc",
  "dam",
  "san",
  "vach",
  "cot",
  "tuong",
  "mai",
  "lat",
  "op",
  "ong",
]);

export const BOQ_MATERIAL_TOKENS = new Set<string>([
  "btct",
  "bttp",
  "dul",
  "inox",
  "son",
  "nap",
  "porcelain",
  "granite",
  "ceramic",
  "ss400",
  "cb240t",
  "cb300v",
  "cb400v",
  "cb500v",
  "vxm",
  "mesh",
  "b20",
  "b22.5",
  "b225",
  "m75",
]);

/**
 * Heuristic: query leans to execution (ép, thi công) vs row text leans to supply
 * ("cung cấp") — small penalty, not a hard filter.
 */
export const BOQ_VERB_EXECUTION =
  /\b(ep|thicong|thi\s*cong|haoc|lap|lapdat|daocat|dao\s*cat|giang)\b/i;
export const BOQ_VERB_SUPPLY =
  /\b(cung\s*cap|cungcap|cung[\s-]*ung|thau|ban\s*giao|cung ung)\b/i;
