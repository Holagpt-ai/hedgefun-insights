import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useJournalLang, useJournalT } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { REPORT_TEMPLATES } from "../reports/templates";
import { REPORTS_KEY, readJson } from "../lib/storage";

export interface ReportRun {
  id: string;
  templateId: string;
  createdAt: string;
  snapshot: Record<string, string | number | null>;
  watermark?: boolean;
}

export function loadRuns(): ReportRun[] {
  return readJson<ReportRun[]>(REPORTS_KEY, []);
}

export function ReportsPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const runs = loadRuns();
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <h1 className="text-lg font-bold">{t("reports.title")}</h1>
        <Button asChild size="sm"><Link to={`${JOURNAL_BASE}/reports/new`}>{t("reports.builder")}</Link></Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("reports.immutable")}</p>
      <div className="grid md:grid-cols-2 gap-2">
        {REPORT_TEMPLATES.map((tpl) => (
          <Link key={tpl.id} to={`${JOURNAL_BASE}/reports/new?template=${tpl.id}`} className="journal-card p-3 block">
            <div className="font-semibold text-sm">{lang === "es" ? tpl.titleEs : tpl.titleEn}</div>
          </Link>
        ))}
      </div>
      <div>
        <h2 className="text-sm font-bold mb-2">{t("reports.saved")}</h2>
        {runs.map((run) => (
          <Link key={run.id} to={`${JOURNAL_BASE}/reports/${run.id}`} className="block text-sm text-accent-blue">{run.templateId} · {run.createdAt}</Link>
        ))}
      </div>
    </div>
  );
}
