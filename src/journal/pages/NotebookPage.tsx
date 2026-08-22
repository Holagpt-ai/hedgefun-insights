import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { HonestState } from "../components/HonestState";
import { useJournalT } from "../i18n";
import { listNotebookEntries, type NotebookEntryRecord } from "../lib/notebook-service";
import { loadNotebook } from "../lib/notebook";
import type { JournalLiveClient } from "../lib/live-client";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

const liveClient = supabase as unknown as JournalLiveClient;

export function NotebookPage() {
  const t = useJournalT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode } = useJournalWorkspace();
  const [entries, setEntries] = useState<NotebookEntryRecord[]>([]);
  const [loading, setLoading] = useState(mode !== "demo");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "demo") {
      setEntries([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listNotebookEntries({
      mode: "live",
      userId: user.id,
      client: liveClient,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? t("state.error"));
        setEntries([]);
        return;
      }
      setError(null);
      setEntries(result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, user, t]);

  const demoEntries = mode === "demo" ? loadNotebook("demo") : [];
  const visible = mode === "demo" ? demoEntries : entries.map((entry) => ({
    id: entry.id,
    title: entry.title || t("notebook.new"),
    date: entry.entryDate ?? entry.createdAt.slice(0, 10),
  }));

  const openNew = () => {
    if (mode === "demo") return;
    navigate(`${JOURNAL_BASE}/notebook/new`);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">{t("notebook.title")}</h1>
        <Button
          size="sm"
          variant="outline"
          disabled={mode === "demo"}
          onClick={openNew}
        >
          {t("notebook.new")}
        </Button>
      </div>
      {mode === "demo" ? <HonestState kind="demo" body={t("notebook.demoReadOnly")} /> : null}
      {loading ? <HonestState kind="loading" title={t("notebook.loading")} /> : null}
      {error ? <HonestState kind="error" title={error} /> : null}
      {!loading && !error && visible.length === 0 ? <HonestState kind="empty" title={t("notebook.empty")} /> : null}
      {!loading && visible.length > 0 ? (
        <ul className="space-y-2">
          {visible.map((entry) => (
            <li key={entry.id} className="journal-card p-3">
              <Link to={`${JOURNAL_BASE}/notebook/${entry.id}`} className="font-semibold">{entry.title}</Link>
              <div className="text-xs text-muted-foreground">{entry.date}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
