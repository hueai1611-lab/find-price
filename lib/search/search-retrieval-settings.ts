import fs from 'fs';
import path from 'path';

export type SearchRetrievalSettings = {
  /** `findMany` take when `needsTechnicalPass` is true (main retrieval). */
  takePrimaryTechnical: number;
  /** `findMany` take when `needsTechnicalPass` is false. */
  takePrimarySimple: number;
  /** `findMany` take for diameter-rescue path. */
  takeDiameterRescue: number;
};

const DEFAULTS: SearchRetrievalSettings = {
  takePrimaryTechnical: 350,
  takePrimarySimple: 50,
  takeDiameterRescue: 800,
};

const MIN = 1;
const MAX = 500_000;

function settingsPath(): string {
  return path.join(process.cwd(), 'data', 'search-retrieval-settings.json');
}

function clampInt(n: unknown, fallback: number): number {
  if (typeof n === 'number' && Number.isFinite(n)) {
    const i = Math.trunc(n);
    return Math.min(MAX, Math.max(MIN, i));
  }
  if (typeof n === 'string' && /^\d+$/.test(n.trim())) {
    return clampInt(Number(n.trim()), fallback);
  }
  return fallback;
}

function normalize(partial: unknown): SearchRetrievalSettings {
  if (!partial || typeof partial !== 'object') return { ...DEFAULTS };
  const o = partial as Record<string, unknown>;
  return {
    takePrimaryTechnical: clampInt(
      o.takePrimaryTechnical,
      DEFAULTS.takePrimaryTechnical,
    ),
    takePrimarySimple: clampInt(
      o.takePrimarySimple,
      DEFAULTS.takePrimarySimple,
    ),
    takeDiameterRescue: clampInt(
      o.takeDiameterRescue,
      DEFAULTS.takeDiameterRescue,
    ),
  };
}

/** Synchronous read for use inside `searchItems` (Node / server only). */
export function getSearchRetrievalSettings(): SearchRetrievalSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULTS };
  }
}

export function mergeSearchRetrievalSettings(
  partial: Partial<SearchRetrievalSettings>,
): SearchRetrievalSettings {
  const base = getSearchRetrievalSettings();
  return normalize({
    takePrimaryTechnical:
      partial.takePrimaryTechnical ?? base.takePrimaryTechnical,
    takePrimarySimple: partial.takePrimarySimple ?? base.takePrimarySimple,
    takeDiameterRescue:
      partial.takeDiameterRescue ?? base.takeDiameterRescue,
  });
}

export function saveSearchRetrievalSettings(
  settings: SearchRetrievalSettings,
): void {
  const dir = path.dirname(settingsPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    settingsPath(),
    `${JSON.stringify(normalize(settings), null, 2)}\n`,
    'utf8',
  );
}
