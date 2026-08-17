import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { microsToNumber } from "../calc";
import { useJournalLang, useJournalT } from "../i18n";
import { REPORTS_KEY, writeJson } from "../lib/storage";
import { JOURNAL_BASE } from "../nav";
import { REPORT_TEMPLATES } from "../reports/templates";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import { loadRuns, type ReportRun } from "./ReportsPage";

export function ReportBuilderPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { metrics, daily, processScore, mode } = useJournalWorkspace();
  const [templateId, setTemplateId] = useState(params.get("template") ?? REPORT_TEMPLATES[0].id);

  const snapshot = useMemo(() => ({
    netPnl: Number(microsToNumber(metrics.netPnl).toFixed(2)),
    profitFactor: metrics.profitFactor,
    expectancy: metrics.expectancyDollars != null ? Number(microsToNumber(metrics.expectancyDollars).toFixed(2)) : null,
    averageR: metrics.averageR,
    sampleSize: metrics.sampleSize,
    processScore,
    days: daily.length,
    calcVersion: metrics.calculationVersion,
  }), [metrics, daily.length, processScore]);

  const run = () => {
    const next: ReportRun = {
      id: `run-${Date.now()}`,
      templateId,
      createdAt: new Date().toISOString(),
      snapshot,
      watermark: mode === "demo",
    };
    writeJson(REPORTS_KEY, [...loadRuns(), next]);
    navigate(`${JOURNAL_BASE}/reports/${next.id}`);
  };

  return (
    <div className="space-y-3 max-w-xl">
      <h1 className="text-lg font-bold">{t("reports.builder")}</h1>
      <Select value={templateId} onValueChange={setTemplateId}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {REPORT_TEMPLATES.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>{lang === "es" ? tpl.titleEs : tpl.titleEn}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <pre className="journal-card p-3 text-xs overflow-auto">{JSON.stringify(snapshot, null, 2)}</pre>
      <Button onClick={run}>{t("reports.run")}</Button>
    </div>
  );
}
