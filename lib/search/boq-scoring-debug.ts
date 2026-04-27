import { BOQ_SYNONYM_GROUPS } from "./boq-synonym-dictionary";
import { BOQ_DUAL_SIDE_PHRASES } from "./boq-ranking-signals";

export type SynonymGroupMatchDebug = { id: string; matchedPatternIndex: number };

/** Which synonym groups fired on the normalized query (for dev breakdown). */
export function synonymGroupsMatchedOnQuery(normalizedQuery: string): SynonymGroupMatchDebug[] {
  const byId = new Map<string, number>();
  BOQ_SYNONYM_GROUPS.forEach((g, groupIndex) => {
    const id = g.id ?? `syn_${groupIndex}`;
    g.match.forEach((re, patternIndex) => {
      re.lastIndex = 0;
      if (re.test(normalizedQuery)) {
        if (!byId.has(id)) byId.set(id, patternIndex);
      }
    });
  });
  return [...byId.entries()].map(([id, matchedPatternIndex]) => ({ id, matchedPatternIndex }));
}

export function dualSidePhrasesMatchedOnQuery(normalizedQuery: string): string[] {
  const ids: string[] = [];
  for (const p of BOQ_DUAL_SIDE_PHRASES) {
    p.re.lastIndex = 0;
    if (p.re.test(normalizedQuery)) ids.push(p.id);
  }
  return ids;
}
