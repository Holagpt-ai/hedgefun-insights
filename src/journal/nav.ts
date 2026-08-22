export type JournalNavGroupId = "operate" | "journal" | "intelligence" | "control";

export interface JournalNavItem {
  id: string;
  path: string;
  i18nKey: string;
}

export interface JournalNavGroup {
  id: JournalNavGroupId;
  i18nKey: string;
  items: JournalNavItem[];
}

export const JOURNAL_BASE = "/dashboard/journal";

export const JOURNAL_NAV: JournalNavGroup[] = [
  {
    id: "operate",
    i18nKey: "nav.groupOperate",
    items: [
      { id: "overview", path: JOURNAL_BASE, i18nKey: "nav.overview" },
      { id: "calendar", path: `${JOURNAL_BASE}/calendar`, i18nKey: "nav.calendar" },
      { id: "dailyReview", path: `${JOURNAL_BASE}/daily-review`, i18nKey: "nav.dailyReview" },
    ],
  },
  {
    id: "journal",
    i18nKey: "nav.groupJournal",
    items: [
      { id: "trades", path: `${JOURNAL_BASE}/trades`, i18nKey: "nav.trades" },
      { id: "notebook", path: `${JOURNAL_BASE}/notebook`, i18nKey: "nav.notebook" },
      { id: "playbooks", path: `${JOURNAL_BASE}/playbooks`, i18nKey: "nav.playbooks" },
    ],
  },
  {
    id: "intelligence",
    i18nKey: "nav.groupIntelligence",
    items: [
      { id: "reports", path: `${JOURNAL_BASE}/reports`, i18nKey: "nav.reports" },
      { id: "analytics", path: `${JOURNAL_BASE}/analytics`, i18nKey: "nav.analytics" },
      { id: "coach", path: `${JOURNAL_BASE}/coach`, i18nKey: "nav.coach" },
    ],
  },
  {
    id: "control",
    i18nKey: "nav.groupControl",
    items: [
      { id: "settings", path: `${JOURNAL_BASE}/settings`, i18nKey: "nav.settings" },
      { id: "aiMemory", path: `${JOURNAL_BASE}/settings?section=ai-memory`, i18nKey: "nav.aiMemory" },
      { id: "dataQuality", path: `${JOURNAL_BASE}/settings?section=data-quality`, i18nKey: "nav.dataQuality" },
      { id: "imports", path: `${JOURNAL_BASE}/settings?section=imports`, i18nKey: "nav.imports" },
      { id: "accounts", path: `${JOURNAL_BASE}/settings?section=accounts`, i18nKey: "nav.accounts" },
    ],
  },
];

export const JOURNAL_EXTRA_PATHS = [
  `${JOURNAL_BASE}/onboarding`,
  `${JOURNAL_BASE}/trades/new`,
  `${JOURNAL_BASE}/trades/:tradeId`,
  `${JOURNAL_BASE}/daily-review/:date`,
  `${JOURNAL_BASE}/notebook/:entryId`,
  `${JOURNAL_BASE}/playbooks/:playbookId`,
  `${JOURNAL_BASE}/reports/new`,
  `${JOURNAL_BASE}/reports/:reportId`,
  `${JOURNAL_BASE}/reports/:reportId/schedule`,
  `${JOURNAL_BASE}/analytics/:analysisId`,
  `${JOURNAL_BASE}/coach`,
] as const;

export function journalNavPaths(): string[] {
  return JOURNAL_NAV.flatMap((group) => group.items.map((item) => item.path));
}

export function navItemIsActive(pathname: string, search: string, itemPath: string): boolean {
  const [path, query] = itemPath.split("?");
  if (query) {
    return pathname === path && search.includes(query);
  }
  if (path === JOURNAL_BASE) {
    return pathname === JOURNAL_BASE || pathname === `${JOURNAL_BASE}/`;
  }
  if (path === `${JOURNAL_BASE}/settings`) {
    return pathname === path && !search.includes("section=");
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
