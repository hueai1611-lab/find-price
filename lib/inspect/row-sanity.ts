type ItemTextFields = {
  nhomCongTac: string | null;
  noiDungCongViec: string | null;
  quyCachKyThuat: string | null;
};

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type RowSanityResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: string };

/**
 * Cheap sanity check: imported BOQ text fields should appear in the Excel row text
 * when `sourceRowNumber` points at the correct 1-based sheet row.
 */
export function verifyExcelRowMatchesItem(
  row: unknown[],
  item: ItemTextFields
): RowSanityResult {
  const rowText = normalizeLoose(row.map((c) => String(c ?? "")).join(" "));
  const needles = [item.nhomCongTac, item.noiDungCongViec, item.quyCachKyThuat]
    .filter((x): x is string => Boolean(x?.trim()))
    .map((x) => normalizeLoose(x))
    .filter((x) => x.length >= 6);

  if (needles.length === 0) {
    return { ok: true, skipped: true };
  }

  const hit = needles.some((n) => {
    const probe = n.slice(0, Math.min(48, n.length));
    return probe.length >= 6 && rowText.includes(probe);
  });

  if (hit) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      "Excel row text does not contain expected nhóm / nội dung / quy snippets from the DB row. The highlighted 1-based row index may be off, or the workbook on disk may differ from the import file.",
  };
}
