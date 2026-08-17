import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HonestState } from "../components/HonestState";
import { useJournalT } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import { loadRuns } from "../reports/runs";

export function SavedReportPage() {
  const { reportId } = useParams();
  const t = useJournalT();
  const { mode } = useJournalWorkspace();
  const run = loadRuns().find((item) => item.id === reportId);
  if (!run) return <HonestState kind="empty" title={t("reports.noRun")} />;

  const exportCsv = () => {
    const header = Object.keys(run.snapshot).join(",");
    const row = Object.values(run.snapshot).join(",");
    const watermark = mode === "demo" || run.watermark ? `\n${t("reports.demoWatermark")}` : "";
    const blob = new Blob([`${header}\n${row}${watermark}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "demo" ? `DEMO-${run.templateId}.csv` : `${run.templateId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{run.templateId}</h1>
      <p className="text-xs text-muted-foreground">{t("reports.immutable")} · {run.createdAt}</p>
      {mode === "demo" ? <p className="journal-badge journal-badge-warn">{t("reports.demoWatermark")}</p> : null}
      <pre className="journal-card p-3 text-xs">{JSON.stringify(run.snapshot, null, 2)}</pre>
      <div className="flex gap-2">
        <Button size="sm" onClick={exportCsv}>{t("reports.exportCsv")}</Button>
        <Button asChild size="sm" variant="outline"><Link to={`${JOURNAL_BASE}/reports/${run.id}/schedule`}>{t("reports.schedule")}</Link></Button>
      </div>
      {mode === "demo" ? <p className="text-xs text-muted-foreground">{t("reports.demoDisabled")}</p> : null}
    </div>
  );
}
