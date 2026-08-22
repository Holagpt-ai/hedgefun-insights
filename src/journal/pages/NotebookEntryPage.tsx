import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentPanel } from "../components/AttachmentPanel";
import { HonestState } from "../components/HonestState";
import { useJournalT } from "../i18n";
import { listNotebookAttachments, type AttachmentRecord } from "../lib/attachments-service";
import type { JournalLiveClient } from "../lib/live-client";
import { loadNotebook } from "../lib/notebook";
import {
  deleteNotebookEntry,
  getNotebookEntry,
  saveNotebookEntry,
} from "../lib/notebook-service";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

const liveClient = supabase as unknown as JournalLiveClient;

export function NotebookEntryPage() {
  const { entryId } = useParams();
  const t = useJournalT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode, allTrades } = useJournalWorkspace();
  const isNew = entryId === "new" || !entryId;
  const demoEntry = mode === "demo" && !isNew ? loadNotebook("demo").find((item) => item.id === entryId) : undefined;

  const [title, setTitle] = useState(demoEntry?.title ?? "");
  const [body, setBody] = useState(demoEntry?.body ?? "");
  const [tradeIds, setTradeIds] = useState<string[]>(demoEntry?.tradeIds ?? []);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(mode !== "demo" && !isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : entryId ?? null);

  const liveTrades = useMemo(
    () => allTrades.filter((trade) => mode !== "demo"),
    [allTrades, mode],
  );

  useEffect(() => {
    if (mode === "demo" || isNew || !user || !entryId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getNotebookEntry({ mode: "live", userId: user.id, client: liveClient }, entryId),
      listNotebookAttachments({ mode: "live", userId: user.id, client: liveClient }, entryId),
    ]).then(([entryResult, attachResult]) => {
      if (cancelled) return;
      setLoading(false);
      if (!entryResult.ok || !entryResult.entry) {
        setNotFound(true);
        setError(entryResult.error === "not_found" ? null : entryResult.error ?? t("state.error"));
        return;
      }
      setTitle(entryResult.entry.title);
      setBody(entryResult.entry.body);
      setTradeIds(entryResult.entry.tradeIds);
      setSavedId(entryResult.entry.id);
      if (attachResult.ok) setAttachments(attachResult.attachments);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, isNew, user, entryId, t]);

  if (mode === "demo" && !demoEntry && !isNew) {
    return <HonestState kind="empty" title={t("notebook.notFound")} />;
  }
  if (notFound) {
    return <HonestState kind="empty" title={t("notebook.notFound")} body={error ?? undefined} />;
  }
  if (loading) return <HonestState kind="loading" title={t("notebook.loading")} />;

  const readOnly = mode === "demo";
  const options = user ? { mode: readOnly ? "demo" as const : "live" as const, userId: user.id, client: liveClient } : null;

  const onSave = async () => {
    if (!options || readOnly || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveNotebookEntry(
      { ...options, visibleTradeIds: liveTrades.map((trade) => trade.id) },
      { id: savedId ?? undefined, title, body, tradeIds },
    );
    setSaving(false);
    if (!result.ok || !result.entry) {
      setError(result.skipped === "demo" ? t("notebook.demoReadOnly") : result.error ?? t("notebook.saveFailed"));
      return;
    }
    setSavedId(result.entry.id);
    setTradeIds(result.entry.tradeIds);
    setMessage(t("notebook.saved"));
    if (isNew) navigate(`${JOURNAL_BASE}/notebook/${result.entry.id}`, { replace: true });
  };

  const onDelete = async () => {
    if (!options || readOnly || saving || !savedId) return;
    if (!window.confirm(t("notebook.confirmDelete"))) return;
    setSaving(true);
    setError(null);
    const result = await deleteNotebookEntry(options, savedId);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? t("notebook.deleteFailed"));
      return;
    }
    navigate(`${JOURNAL_BASE}/notebook`);
  };

  const unlink = (id: string) => setTradeIds((current) => current.filter((item) => item !== id));
  const linkable = liveTrades.filter((trade) => !tradeIds.includes(trade.id));

  return (
    <div className="space-y-3 max-w-2xl">
      {readOnly ? <HonestState kind="demo" body={t("notebook.demoReadOnly")} /> : null}
      <label className="text-xs font-semibold block space-y-1">
        <span>{t("notebook.titleField")}</span>
        <Input value={title} disabled={readOnly} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">
        {demoEntry?.date ?? (savedId ? undefined : t("notebook.unsaved"))}
      </p>
      <label className="text-xs font-semibold block space-y-1">
        <span>{t("notebook.bodyField")}</span>
        <Textarea value={body} disabled={readOnly} rows={8} onChange={(event) => setBody(event.target.value)} />
      </label>
      <div>
        <div className="text-xs font-semibold mb-1">{t("notebook.linkedTrades")}</div>
        {tradeIds.length === 0 ? <p className="text-xs text-muted-foreground">{t("notebook.noLinked")}</p> : (
          <ul className="text-sm space-y-1">
            {tradeIds.map((id) => {
              const trade = allTrades.find((item) => item.id === id);
              return (
                <li key={id} className="flex items-center justify-between gap-2">
                  <a className="text-accent-blue" href={`${JOURNAL_BASE}/trades/${id}`}>{trade?.symbol ?? id}</a>
                  {readOnly ? null : (
                    <Button size="sm" variant="outline" type="button" onClick={() => unlink(id)}>{t("notebook.unlink")}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {readOnly || linkable.length === 0 ? null : (
          <div className="mt-2">
            <Select onValueChange={(value) => setTradeIds((current) => current.includes(value) ? current : [...current, value])}>
              <SelectTrigger className="h-[34px] w-56"><SelectValue placeholder={t("notebook.chooseTrade")} /></SelectTrigger>
              <SelectContent>
                {linkable.map((trade) => (
                  <SelectItem key={trade.id} value={trade.id}>{trade.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {options && savedId ? (
        <AttachmentPanel
          mode={options.mode}
          userId={options.userId}
          client={liveClient}
          kind="notebook"
          parentId={savedId}
          attachments={attachments}
          onChange={setAttachments}
          disabled={readOnly}
        />
      ) : null}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-xs journal-loss">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={readOnly || saving} onClick={() => void onSave()}>
          {saving ? t("notebook.saving") : t("notebook.save")}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={() => navigate(`${JOURNAL_BASE}/notebook`)}>
          {t("notebook.cancel")}
        </Button>
        {readOnly || !savedId ? null : (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void onDelete()}>
            {t("notebook.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}
