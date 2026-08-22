import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPanel } from "./AttachmentPanel";
import { HonestState } from "./HonestState";
import { JournalPanel } from "./JournalPanel";
import { useJournalT } from "../i18n";
import {
  listNoteAttachments,
  type AttachmentRecord,
} from "../lib/attachments-service";
import type { JournalLiveClient } from "../lib/live-client";
import {
  deleteTradeNote,
  listTradeNotes,
  saveTradeNote,
  type TradeNoteRecord,
} from "../lib/notes-service";
import type { JournalMode } from "../workspace/JournalWorkspace";

export function TradeNotesPanel({
  mode,
  userId,
  client,
  tradeId,
  thesis,
}: {
  mode: JournalMode;
  userId?: string;
  client: JournalLiveClient;
  tradeId: string;
  thesis: string | null;
}) {
  const t = useJournalT();
  const [notes, setNotes] = useState<TradeNoteRecord[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode !== "demo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readOnly = mode === "demo" || !userId;
  const options = userId ? { mode: readOnly ? "demo" as const : "live" as const, userId, client } : null;

  useEffect(() => {
    if (!options || mode === "demo") {
      setNotes([]);
      setAttachments([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      listTradeNotes(options, tradeId),
      listNoteAttachments(options, tradeId),
    ]).then(([noteResult, attachResult]) => {
      if (cancelled) return;
      setLoading(false);
      if (!noteResult.ok) {
        setError(noteResult.error ?? t("notes.loadFailed"));
        setNotes([]);
        return;
      }
      setError(null);
      setNotes(noteResult.notes);
      if (attachResult.ok) setAttachments(attachResult.attachments);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, userId, tradeId, t]);

  const onSave = async () => {
    if (!options || readOnly || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveTradeNote(options, { id: editingId ?? undefined, tradeId, body: draft });
    setSaving(false);
    if (!result.ok || !result.note) {
      setError(result.skipped === "demo" ? t("notes.demoReadOnly") : result.error ?? t("notes.saveFailed"));
      return;
    }
    setNotes((current) => {
      const index = current.findIndex((note) => note.id === result.note!.id);
      if (index === -1) return [...current, result.note!];
      return current.map((note) => (note.id === result.note!.id ? result.note! : note));
    });
    setDraft("");
    setEditingId(null);
    setMessage(t("notes.saved"));
  };

  const onDelete = async (note: TradeNoteRecord) => {
    if (!options || readOnly || saving) return;
    if (!window.confirm(t("notes.confirmDelete"))) return;
    setSaving(true);
    setError(null);
    const result = await deleteTradeNote(options, { id: note.id, tradeId });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? t("notes.deleteFailed"));
      return;
    }
    setNotes((current) => current.filter((item) => item.id !== note.id));
    if (editingId === note.id) {
      setEditingId(null);
      setDraft("");
    }
    setMessage(t("notes.deleted"));
  };

  return (
    <JournalPanel className="text-sm space-y-3" data-testid="journal-trade-notes">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("detail.thesis")}</div>
        <p className="font-semibold">{thesis ?? t("detail.noNotes")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("notes.thesisSeparate")}</p>
      </div>
      {mode === "demo" ? <HonestState kind="demo" body={t("notes.demoReadOnly")} /> : null}
      {loading ? <HonestState kind="loading" /> : null}
      {!loading && notes.length === 0 ? <p className="text-xs text-muted-foreground">{t("notes.empty")}</p> : null}
      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="journal-card p-2 space-y-1">
            <p className="whitespace-pre-wrap">{note.body}</p>
            {readOnly ? null : (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" type="button" onClick={() => { setEditingId(note.id); setDraft(note.body); }}>
                  {t("notes.edit")}
                </Button>
                <Button size="sm" variant="outline" type="button" disabled={saving} onClick={() => void onDelete(note)}>
                  {t("notes.delete")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? null : (
        <div className="space-y-2">
          <label className="text-xs font-semibold block space-y-1">
            <span>{editingId ? t("notes.edit") : t("notes.add")}</span>
            <Textarea rows={4} value={draft} disabled={loading} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <Button type="button" size="sm" disabled={loading || saving || !draft.trim()} onClick={() => void onSave()}>
            {saving ? t("notebook.saving") : t("notes.save")}
          </Button>
        </div>
      )}
      {options ? (
        <AttachmentPanel
          mode={options.mode}
          userId={options.userId}
          client={client}
          kind="notes"
          parentId={tradeId}
          tradeId={tradeId}
          attachments={attachments}
          onChange={setAttachments}
          disabled={readOnly}
        />
      ) : null}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-xs journal-loss">{error}</p> : null}
    </JournalPanel>
  );
}
