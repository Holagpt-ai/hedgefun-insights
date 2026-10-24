import { normalizePath } from "./routes.mjs";

/** Navigation surfaces checked for targets that do not match a route. */
export const NAV_FILES = [
  "src/components/layout/AppSidebar.tsx",
  "src/components/layout/Footer.tsx",
  "src/components/layout/MobileBottomNav.tsx",
  "src/components/layout/Header.tsx",
  "src/components/dashboard/DashboardSidebar.tsx",
  "src/pages/dashboard/ActionCenter.tsx",
  "src/journal/nav.ts",
];

export function extractLiteralTargets(source) {
  const targets = [];
  const re = /(?:\b(?:route|to|path)\s*:\s*|navigate\(\s*)["'](\/[^"'?#]*)/g;
  for (const match of source.matchAll(re)) targets.push(normalizePath(match[1]));
  return targets;
}

export function extractJournalTargets(source) {
  const baseMatch = source.match(/export const JOURNAL_BASE = ["'](\/[^"']+)["']/);
  const base = baseMatch?.[1] ?? "/dashboard/journal";
  const targets = [];
  if (/path:\s*JOURNAL_BASE\b/.test(source)) targets.push(normalizePath(base));
  const re = /\$\{JOURNAL_BASE\}([^`"'\\\s]*)/g;
  for (const match of source.matchAll(re)) {
    const suffix = match[1].split("?")[0];
    targets.push(normalizePath(`${base}${suffix}`));
  }
  return targets;
}

export function extractNavigationTargets(file, source) {
  const targets = new Set(extractLiteralTargets(source));
  if (file.replaceAll("\\", "/").endsWith("src/journal/nav.ts")) {
    for (const target of extractJournalTargets(source)) targets.add(target);
  }
  return [...targets];
}
