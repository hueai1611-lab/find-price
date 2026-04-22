function includesPhrase(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

export function calculateScore(
  query: string,
  item: {
    normalizedSearchText: string;
    normalizedNoiDungCongViec?: string | null;
    normalizedNhomCongTac?: string | null;
    normalizedQuyCachKyThuat?: string | null;
  }
) {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  let score = 0;
  const breakdown: Record<string, number> = {};

  if (item.normalizedNoiDungCongViec && includesPhrase(item.normalizedNoiDungCongViec, q)) {
    score += 40;
    breakdown.exactInWorkContent = 40;
  }

  const fields = [
    item.normalizedNoiDungCongViec ?? "",
    item.normalizedNhomCongTac ?? "",
    item.normalizedQuyCachKyThuat ?? "",
    item.normalizedSearchText ?? "",
  ].join(" ");

  let tokenHits = 0;
  for (const token of tokens) {
    if (fields.includes(token)) tokenHits++;
  }

  const keywordScore = tokens.length > 0 ? (tokenHits / tokens.length) * 50 : 0;
  score += keywordScore;
  breakdown.keywordOverlap = keywordScore;

  let confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match" =
    "Related Match";

  if (score >= 90) confidenceLabel = "Exact Match";
  else if (score >= 75) confidenceLabel = "Strong Match";
  else if (score >= 55) confidenceLabel = "Near Match";

  return { score, confidenceLabel, breakdown };
}