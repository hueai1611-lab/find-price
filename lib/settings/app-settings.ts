import path from "path";

import { prisma } from "@/lib/db/prisma";

const SINGLETON_SETTINGS_ID = "app_settings_singleton";

export type AppSettingsSnapshot = {
  quarterMasterSharedRootPath: string;
};

function normalizeWindowsRootPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // UNC roots should end with a backslash for stable concatenation.
  return trimmed.endsWith("\\") ? trimmed : `${trimmed}\\`;
}

/** Opt-in: in dev, use `AppSettings.quarterMasterSharedRootPath` like production. */
function quarterMasterUseAppSettingsInDev(): boolean {
  const v = process.env.QUARTER_MASTER_USE_APP_SETTINGS_IN_DEV?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Fixed local dev root path inside this repo.
 * Used in non-production when not using AppSettings (see `resolveQuarterMasterRootPath`).
 */
export function getFixedDevQuarterMasterRootPath(): string {
  // repoRoot is 3 levels up from /lib/settings/app-settings.ts
  const repoRoot = path.join(process.cwd());
  return path.join(repoRoot, "data") + path.sep;
}

/**
 * Fetch settings. Always returns a row (singleton behavior).
 */
export async function getAppSettings(): Promise<AppSettingsSnapshot> {
  const row = await prisma.appSettings.upsert({
    where: { id: SINGLETON_SETTINGS_ID },
    create: { id: SINGLETON_SETTINGS_ID, quarterMasterSharedRootPath: "" },
    update: {},
    select: { quarterMasterSharedRootPath: true },
  });

  return {
    quarterMasterSharedRootPath: row.quarterMasterSharedRootPath ?? "",
  };
}

/**
 * Update shared root path (production UNC path).
 */
export async function setQuarterMasterSharedRootPath(
  quarterMasterSharedRootPath: string
): Promise<AppSettingsSnapshot> {
  const normalized = normalizeWindowsRootPath(quarterMasterSharedRootPath);

  const row = await prisma.appSettings.upsert({
    where: { id: SINGLETON_SETTINGS_ID },
    create: { id: SINGLETON_SETTINGS_ID, quarterMasterSharedRootPath: normalized },
    update: { quarterMasterSharedRootPath: normalized },
    select: { quarterMasterSharedRootPath: true },
  });

  return {
    quarterMasterSharedRootPath: row.quarterMasterSharedRootPath ?? "",
  };
}

/**
 * Resolve the quarter master root path for formula linking.
 * - production: `AppSettings.quarterMasterSharedRootPath`
 * - dev/test (default): fixed local repo `data/` path
 * - dev/test (opt-in): same as production when `QUARTER_MASTER_USE_APP_SETTINGS_IN_DEV=1` or `true`
 */
export async function resolveQuarterMasterRootPath(): Promise<string> {
  const useAppSettings =
    process.env.NODE_ENV === "production" || quarterMasterUseAppSettingsInDev();
  if (useAppSettings) {
    const settings = await getAppSettings();
    return normalizeWindowsRootPath(settings.quarterMasterSharedRootPath);
  }
  return getFixedDevQuarterMasterRootPath();
}

