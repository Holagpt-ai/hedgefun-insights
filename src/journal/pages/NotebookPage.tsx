import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HonestState } from "../components/HonestState";
import { AUGUST_14_TRADES } from "../demo/august-fixtures";
import { useJournalT } from "../i18n";
import { NOTEBOOK_KEY, readJson, writeJson } from "../lib/storage";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

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

export function NotebookPage() {
  const t = useJournalT();
  const { mode } = useJournalWorkspace();
  const entries = loadNotebook(mode);
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">{t("notebook.title")}</h1>
        <Button size="sm" variant="outline" onClick={() => {
          if (mode === "demo") return;
          const next: NotebookEntry = { id: `nb-${Date.now()}`, title: t("notebook.new"), date: new Date().toISOString().slice(0, 10), body: "", tradeIds: [] };
          writeJson(NOTEBOOK_KEY, [next, ...entries]);
        }}>{t("notebook.new")}</Button>
      </div>
      {entries.length === 0 ? <HonestState kind="empty" title={t("notebook.empty")} /> : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="journal-card p-3">
              <Link to={`${JOURNAL_BASE}/notebook/${entry.id}`} className="font-semibold">{entry.title}</Link>
              <div className="text-xs text-muted-foreground">{entry.date}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
