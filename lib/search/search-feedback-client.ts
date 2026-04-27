import type { SearchFeedbackAction } from "./feedback-ranking";

export type PostSearchFeedbackInput = {
  query: string;
  /** Required for item actions; omit for `no_suitable_result`. */
  boqItemId?: string;
  pricePeriodCode?: string;
  action?: SearchFeedbackAction;
  resultBoqItemIds?: string[];
  resultCount?: number;
  selectedRank?: number;
};

function warnFeedbackFailure(status: number, body: string, err?: unknown) {
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[search-feedback]", status, body || err);
  }
}

/** Fire-and-forget; failures only log a console warning (does not block UI). */
export function postSearchFeedback(input: PostSearchFeedbackInput): void {
  const {
    query,
    boqItemId,
    pricePeriodCode,
    action,
    resultBoqItemIds,
    resultCount,
    selectedRank,
  } = input;
  void fetch("/api/search-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      ...(boqItemId != null && boqItemId.trim() !== "" ? { boqItemId: boqItemId.trim() } : {}),
      ...(pricePeriodCode != null && pricePeriodCode.trim() !== ""
        ? { pricePeriodCode: pricePeriodCode.trim() }
        : {}),
      ...(action != null ? { action } : {}),
      ...(resultBoqItemIds != null && resultBoqItemIds.length > 0
        ? { resultBoqItemIds }
        : {}),
      ...(resultCount != null ? { resultCount } : {}),
      ...(selectedRank != null ? { selectedRank } : {}),
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        warnFeedbackFailure(res.status, t);
      }
    })
    .catch((err: unknown) => warnFeedbackFailure(0, "", err));
}
