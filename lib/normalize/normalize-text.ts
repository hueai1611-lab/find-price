export function removeVietnameseTones(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";

  return removeVietnameseTones(input)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s./\-x]/gu, " ")
    .trim();
}