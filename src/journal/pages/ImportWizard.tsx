import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { microsToNumber } from "../calc";
import { HonestState } from "../components/HonestState";
import { JournalTable, TableCell, TableRow } from "../components/JournalTable";
import { useJournalT } from "../i18n";
import { parseCsvText, previewCsvNets, type ParsedCsv } from "../import/csv";
import {
  canRollbackImportJob,
  formatConfirmedImportSummary,
  loadRecentImportJobs,
  rollbackImportJob,
  runCsvImport,
  type ImportJobRecord,
} from "../import/import-service";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function ImportWizard() {
  const t = useJournalT();
  const { user } = useAuth();
  const { mode, hideDemo, refresh } = useJournalWorkspace();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [filename, setFilename] = useState("import.csv");
  const [message, setMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ImportJobRecord[]>([]);

  const userId = user?.id;
  const reloadJobs = useCallback(async () => {
    if (!userId || mode === "demo") {
      setJobs([]);
      return;
    }
    const recent = await loadRecentImportJobs({
      mode,
      userId,
      client: supabase as never,
    });
    setJobs(recent);
  }, [userId, mode]);

  useEffect(() => {
    void reloadJobs();
  }, [reloadJobs]);

  const onFile = async (file: File) => {
    const text = await file.text();
    setFilename(file.name || "import.csv");
    setParsed(parseCsvText(text));
    setMessage(null);
    setProgress(null);
  };

  const confirm = async () => {
    if (!parsed || !user || processing) return;
    if (mode === "demo") {
      setMessage(t("import.demoBlock"));
      return;
    }
    setProcessing(true);
    setProgress(t("import.processing"));
    const result = await runCsvImport(parsed, {
      mode,
      userId: user.id,
      client: supabase as never,
      filename,
      onProgress: (item) => setProgress(t("import.progress", { done: item.processed, total: item.total })),
    });
    setProcessing(false);
    setProgress(null);
    if (result.skipped === "demo") {
      setMessage(t("import.demoBlock"));
      return;
    }
    if (!result.ok) {
      setMessage(result.error ?? t("import.unconfirmed"));
      return;
    }
    setMessage(formatConfirmedImportSummary(result.counts));
    if (result.shouldHideDemo) hideDemo();
    if (result.shouldRefresh) await refresh();
    await reloadJobs();
  };

  const onRollback = async (job: ImportJobRecord) => {
    if (!user || processing || mode === "demo") return;
    if (!canRollbackImportJob(job)) return;
    setProcessing(true);
    const result = await rollbackImportJob(job.id, {
      mode,
      userId: user.id,
      client: supabase as never,
    });
    setProcessing(false);
    if (!result.ok) {
      setMessage(result.error ?? t("import.rollbackUnconfirmed"));
      return;
    }
    setMessage(t("import.rolledConfirmed", { n: result.tradesDeleted }));
    await refresh();
    await reloadJobs();
  };

  return (
    <div className="journal-card p-3 space-y-3">
      <h2 className="font-semibold">{t("import.title")}</h2>
      {mode === "demo" ? <HonestState kind="demo" body={t("import.demoBlock")} /> : null}
      <label className="text-xs block border border-dashed rounded-md p-4 cursor-pointer">
        {t("import.drop")}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }} />
      </label>
      {parsed ? (
        <>
          <p className="text-xs">{t("import.detected", { format: parsed.format })} · {t("import.rows", { n: parsed.validTrades.length })} · {t("import.invalid", { n: parsed.rows.filter((r) => r.errors.length).length })} · {t("import.dupes", { n: parsed.duplicateIds.length })}</p>
          <JournalTable headers={[t("trades.symbol"), t("trades.net"), t("import.validation")]}>
            {previewCsvNets(parsed).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.symbol}</TableCell>
                <TableCell className="tabular-nums">{microsToNumber(row.net).toFixed(2)}</TableCell>
                <TableCell>{row.status}</TableCell>
              </TableRow>
            ))}
          </JournalTable>
          <div className="flex gap-2">
            <Button size="sm" disabled={processing || mode === "demo"} onClick={() => void confirm()}>{t("import.confirm")}</Button>
            <Button size="sm" variant="outline" disabled={processing} onClick={() => setParsed(null)}>{t("import.cancel")}</Button>
          </div>
        </>
      ) : null}
      {progress ? <p className="text-xs">{progress}</p> : null}
      {message ? <p className="text-xs" data-testid="import-message">{message}</p> : null}
      {mode !== "demo" ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("import.recent")}</h3>
          {jobs.length === 0 ? <p className="text-xs text-muted-foreground">{t("import.noJobs")}</p> : (
            <JournalTable headers={[t("import.file"), t("import.created"), t("import.status"), t("import.importedCount"), t("import.otherCounts"), ""]}>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{job.filename || job.source}</TableCell>
                  <TableCell>{job.created_at.slice(0, 10)}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell className="tabular-nums">{job.imported_count}</TableCell>
                  <TableCell className="text-xs">{t("import.jobCounts", { failed: job.failed_count, invalid: job.invalid_count, duplicates: job.duplicate_count })}</TableCell>
                  <TableCell>
                    {canRollbackImportJob(job) ? (
                      <Button size="sm" variant="ghost" disabled={processing} onClick={() => void onRollback(job)}>{t("import.rollback")}</Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </JournalTable>
          )}
        </div>
      ) : null}
    </div>
  );
}
