import { useParams } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import { HonestState } from "../components/HonestState";
import { useJournalT } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import { loadNotebook } from "./NotebookPage";

export function NotebookEntryPage() {
  const { entryId } = useParams();
  const t = useJournalT();
  const { mode, allTrades } = useJournalWorkspace();
  const entry = loadNotebook(mode).find((item) => item.id === entryId);
  if (!entry) return <HonestState kind="empty" title={t("notebook.notFound")} />;
  return (
    <div className="space-y-3 max-w-2xl">
      <h1 className="text-lg font-bold">{entry.title}</h1>
      <p className="text-xs text-muted-foreground">{entry.date}</p>
      <Textarea defaultValue={entry.body} rows={8} />
      <div>
        <div className="text-xs font-semibold mb-1">{t("notebook.linkedTrades")}</div>
        <ul className="text-sm">
          {entry.tradeIds.map((id) => {
            const trade = allTrades.find((item) => item.id === id);
            return (
              <li key={id}>
                <a className="text-accent-blue" href={`${JOURNAL_BASE}/trades/${id}`}>{trade?.symbol ?? id}</a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
