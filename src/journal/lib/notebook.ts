import { AUGUST_14_TRADES } from "../demo/august-fixtures";

export interface NotebookEntry {
  id: string;
  title: string;
  date: string;
  body: string;
  tradeIds: string[];
}

export const DEMO_NOTEBOOK_ENTRIES: NotebookEntry[] = [
  {
    id: "nb-aug-14",
    title: "Aug 14 process",
    date: "2026-08-14",
    body: "Only trade symbols from the pre-market watchlist. PLTR was outside the plan.",
    tradeIds: AUGUST_14_TRADES.map((t) => t.id),
  },
];

/** Demo Workspace only. Live Notebook entries are loaded from Supabase, never localStorage. */
export function loadNotebook(mode: string): NotebookEntry[] {
  if (mode === "demo") return DEMO_NOTEBOOK_ENTRIES;
  return [];
}
