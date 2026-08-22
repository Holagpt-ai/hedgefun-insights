import { useParams } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HonestState } from "../components/HonestState";
import { useJournalT } from "../i18n";
import { loadRuns } from "../reports/runs";

export function ReportSchedulePage() {
  const { reportId } = useParams();
  const t = useJournalT();
  const run = loadRuns().find((item) => item.id === reportId);
  if (!run) return <HonestState kind="empty" title={t("reports.noRun")} />;
  return (
    <div className="space-y-3 max-w-md">
      <h1 className="text-lg font-bold">{t("reports.schedule")}</h1>
      <Select defaultValue="weekly">
        <SelectTrigger><SelectValue placeholder={t("reports.frequency")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">{t("reports.daily")}</SelectItem>
          <SelectItem value="weekly">{t("reports.weekly")}</SelectItem>
          <SelectItem value="monthly">{t("reports.monthly")}</SelectItem>
          <SelectItem value="quarterly">{t("reports.quarterly")}</SelectItem>
          <SelectItem value="custom">{t("reports.custom")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("reports.emailLater")}</p>
    </div>
  );
}
