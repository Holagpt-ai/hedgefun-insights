import { AUGUST_14_TRADES } from "../demo/august-fixtures";
import { NOTEBOOK_KEY, readJson } from "./storage";

export interface NotebookEntry {
  id: string;
  title: string;
  date: string;
  body: string;
  tradeIds: string[];
}

const DEMO_ENTRIES: NotebookEntry[] = [
  {
    id: "nb-aug-14",
    title: "Aug 14 process",
    date: "2026-08-14",
    body: "Only trade symbols from the pre-market watchlist. PLTR was outside the plan.",
    tradeIds: AUGUST_14_TRADES.map((t) => t.id),
  },
];

export function loadNotebook(mode: string): NotebookEntry[] {
  if (mode === "demo") return DEMO_ENTRIES;
  return readJson<NotebookEntry[]>(NOTEBOOK_KEY, []);
}
