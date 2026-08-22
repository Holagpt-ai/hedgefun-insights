import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useJournalT } from "../i18n";
import {
  createAttachmentSignedUrl,
  deleteAttachment,
  uploadAttachment,
  type AttachmentRecord,
} from "../lib/attachments-service";
import type { AttachmentKind, JournalLiveClient } from "../lib/live-client";
import type { JournalMode } from "../workspace/JournalWorkspace";

export function AttachmentPanel({
  mode,
  userId,
  client,
  kind,
  parentId,
  tradeId,
  attachments,
  onChange,
  disabled,
}: {
  mode: JournalMode;
  userId: string;
  client: JournalLiveClient;
  kind: AttachmentKind;
  parentId: string;
  tradeId?: string | null;
  attachments: AttachmentRecord[];
  onChange: (next: AttachmentRecord[]) => void;
  disabled?: boolean;
}) {
  const t = useJournalT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = mode === "demo" || disabled || !parentId;

  const onUpload = async (file: File | undefined) => {
    if (!file || readOnly || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await uploadAttachment(
      { mode, userId, client },
      { kind, parentId, tradeId, file: { name: file.name, type: file.type, size: file.size, body: file } },
    );
    setBusy(false);
    if (!result.ok || !result.attachment) {
      setError(result.skipped === "demo" ? t("attach.demoReadOnly") : result.error ?? t("attach.failed"));
      return;
    }
    onChange([...attachments, result.attachment]);
    setMessage(t("attach.uploaded"));
  };

  const onView = async (attachment: AttachmentRecord) => {
    setError(null);
    const result = await createAttachmentSignedUrl({ mode, userId, client }, attachment.id);
    if (!result.ok || !result.signedUrl) {
      setError(result.error ?? t("attach.failed"));
      return;
    }
    window.open(result.signedUrl, "_blank", "noopener,noreferrer");
  };

  const onDelete = async (attachment: AttachmentRecord) => {
    if (readOnly || busy) return;
    if (!window.confirm(t("attach.confirmDelete"))) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await deleteAttachment({ mode, userId, client }, attachment.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("attach.deleteFailed"));
      return;
    }
    onChange(attachments.filter((item) => item.id !== attachment.id));
    setMessage(t("attach.deleted"));
  };

  return (
    <div className="space-y-2" data-testid="journal-attachments">
      <div className="text-xs font-semibold">{t("attach.title")}</div>
      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("attach.empty")}</p>
      ) : (
        <ul className="text-sm space-y-1">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0 space-x-1">
                <Button size="sm" variant="outline" type="button" onClick={() => void onView(attachment)}>
                  {t("attach.view")}
                </Button>
                {readOnly ? null : (
                  <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => void onDelete(attachment)}>
                    {t("attach.delete")}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {readOnly ? (
        mode === "demo" ? <p className="text-xs text-muted-foreground">{t("attach.demoReadOnly")}</p> : null
      ) : (
        <label className="text-xs font-semibold block space-y-1">
          <span>{t("attach.upload")}</span>
          <input
            type="file"
            data-testid="journal-attachment-input"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onUpload(file);
            }}
          />
        </label>
      )}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-xs journal-loss">{error}</p> : null}
    </div>
  );
}
