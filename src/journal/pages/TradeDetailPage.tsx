import { Link, useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateProcessScore, calculateTrade, formatMoney, microsToNumber } from "../calc";
import { EvidenceCard } from "../components/EvidenceCard";
import { HonestState } from "../components/HonestState";
import { StatusBadge } from "../components/StatusBadge";
import { JournalTable, TableCell, TableRow } from "../components/JournalTable";
import { useJournalLang, useJournalT } from "../i18n";
import { signedMoney } from "../lib/format";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function TradeDetailPage() {
  const { tradeId } = useParams();
  const t = useJournalT();
  const lang = useJournalLang();
  const { allTrades, mode } = useJournalWorkspace();
  const trade = allTrades.find((item) => item.id === tradeId);
  if (!trade) return <HonestState kind="empty" title={t("detail.notFound")} />;

  const calc = calculateTrade(trade);
  const process = calculateProcessScore(trade);
  const locale = lang === "es" ? "es-ES" : "en-US";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{trade.symbol}</h1>
        <StatusBadge status={calc.status} outcome={calc.outcome} />
      </div>
      <Tabs defaultValue="summary">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="summary">{t("detail.summary")}</TabsTrigger>
          <TabsTrigger value="plan">{t("detail.plan")}</TabsTrigger>
          <TabsTrigger value="executions">{t("detail.executions")}</TabsTrigger>
          <TabsTrigger value="risk">{t("detail.risk")}</TabsTrigger>
          <TabsTrigger value="review">{t("detail.review")}</TabsTrigger>
          <TabsTrigger value="ai">{t("detail.ai")}</TabsTrigger>
          <TabsTrigger value="notes">{t("detail.notes")}</TabsTrigger>
          <TabsTrigger value="audit">{t("detail.audit")}</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="journal-card p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label={t("detail.gross")} value={signedMoney(calc.grossRealizedPnl, lang)} />
          <Field label={t("detail.net")} value={signedMoney(calc.netRealizedPnl, lang)} />
          <Field label={t("detail.entry")} value={calc.weightedAverageEntry != null ? formatMoney(calc.weightedAverageEntry, locale) : "—"} />
          <Field label={t("detail.exit")} value={calc.weightedAverageExit != null ? formatMoney(calc.weightedAverageExit, locale) : "—"} />
          <Field label={t("trades.remaining")} value={microsToNumber(calc.remainingQuantity).toFixed(0)} />
          <Field label={t("trades.r")} value={calc.rMultiple != null ? calc.rMultiple.toFixed(2) : "—"} />
        </TabsContent>
        <TabsContent value="plan" className="journal-card p-3 text-sm space-y-1">
          <Field label={t("new.plannedEntry")} value={String(trade.plannedEntry ?? "—")} />
          <Field label={t("new.plannedStop")} value={String(trade.plannedStop ?? "—")} />
          <Field label={t("new.plannedTarget")} value={String(trade.plannedTarget ?? "—")} />
          <Field label={t("new.plannedRisk")} value={String(trade.plannedRisk ?? "—")} />
          <Field label={t("detail.thesis")} value={trade.thesis ?? t("detail.noNotes")} />
        </TabsContent>
        <TabsContent value="executions">
          <JournalTable headers={[t("new.time"), t("new.action"), t("new.qty"), t("new.price"), t("new.commission")]}>
            {trade.executions.map((ex) => (
              <TableRow key={ex.id}>
                <TableCell className="tabular-nums">{ex.timestampUtc}</TableCell>
                <TableCell>{ex.action}</TableCell>
                <TableCell className="tabular-nums">{String(ex.quantity)}</TableCell>
                <TableCell className="tabular-nums">{String(ex.price)}</TableCell>
                <TableCell className="tabular-nums">{String(ex.commission ?? 0)}</TableCell>
              </TableRow>
            ))}
          </JournalTable>
        </TabsContent>
        <TabsContent value="risk" className="journal-card p-3 text-sm">
          <Field label={t("kpi.processScore")} value={process.total != null ? String(process.total) : t("state.unavailable")} />
          <Field label={t("trades.openExposure")} value={microsToNumber(calc.remainingQuantity).toFixed(4)} />
        </TabsContent>
        <TabsContent value="review" className="journal-card p-3 text-sm">
          <p>{trade.reviewed ? t("review.complete") : t("review.inProgress")}</p>
          <Link className="text-accent-blue text-xs font-semibold" to={`${JOURNAL_BASE}/daily-review/${trade.sessionDate}`}>{t("nav.dailyReview")}</Link>
        </TabsContent>
        <TabsContent value="ai">
          <EvidenceCard
            demo={mode === "demo"}
            title={t("coach.title")}
            body={mode === "demo" ? t("detail.demoAi") : t("coach.empty")}
            tone="brand"
          />
        </TabsContent>
        <TabsContent value="notes" className="journal-card p-3 text-sm">
          {trade.thesis ?? t("detail.noNotes")}
        </TabsContent>
        <TabsContent value="audit" className="journal-card p-3 text-xs space-y-1">
          <p>{t("detail.lineage", { calc: calc.calculationVersion, input: calc.inputVersion })}</p>
          <p>{calc.exclusions.join(", ") || "—"}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
