import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTradeAuditRecord,
  buildTradeRiskEvidence,
  calculateProcessScore,
  calculateTrade,
  formatMoney,
  microsToNumber,
} from "../calc";
import type { JournalMessageKey } from "../i18n";
import { EvidenceCard } from "../components/EvidenceCard";
import { HonestState } from "../components/HonestState";
import { JournalPanel } from "../components/JournalPanel";
import { StatusBadge } from "../components/StatusBadge";
import { JournalTable, TableCell, TableRow } from "../components/JournalTable";
import { TradeNotesPanel } from "../components/TradeNotesPanel";
import { useJournalLang, useJournalT } from "../i18n";
import { deleteOwnedTrade } from "../lib/delete-owned";
import { formatR, money, signedMoney } from "../lib/format";
import type { JournalLiveClient } from "../lib/live-client";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

const liveClient = supabase as unknown as JournalLiveClient;

export function TradeDetailPage() {
  const { tradeId } = useParams();
  const t = useJournalT();
  const lang = useJournalLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { allTrades, mode, demoLabel, refresh } = useJournalWorkspace();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSymbol, setConfirmSymbol] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const trade = allTrades.find((item) => item.id === tradeId);
  if (!trade) return <HonestState kind="empty" title={t("detail.notFound")} />;

  const calc = calculateTrade(trade);
  const process = calculateProcessScore(trade);
  const risk = buildTradeRiskEvidence(trade, calc);
  const audit = buildTradeAuditRecord(trade, calc, {
    demo: mode === "demo",
    demoLabel: demoLabel[lang],
  });
  const locale = lang === "es" ? "es-ES" : "en-US";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{trade.symbol}</h1>
        <div className="flex items-center gap-2">
          <StatusBadge status={calc.status} outcome={calc.outcome} />
          {mode === "demo" ? null : (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => {
                setConfirmSymbol("");
                setDeleteError(null);
                setConfirmOpen(true);
              }}
            >
              {t("detail.deleteTrade")}
            </Button>
          )}
        </div>
      </div>
      {deleteMessage ? <p className="text-xs text-muted-foreground">{deleteMessage}</p> : null}
      {deleteError ? <p className="text-xs journal-loss">{deleteError}</p> : null}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detail.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("detail.confirmDeleteBody", { symbol: trade.symbol })}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmSymbol}
            onChange={(event) => setConfirmSymbol(event.target.value)}
            placeholder={trade.symbol}
            aria-label={t("detail.confirmSymbolLabel")}
            data-testid="confirm-trade-symbol"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("notebook.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              data-testid="confirm-delete-trade"
              disabled={deleting || confirmSymbol.trim().toUpperCase() !== trade.symbol.trim().toUpperCase()}
              onClick={async () => {
                if (!user || deleting) return;
                setDeleting(true);
                setDeleteError(null);
                const result = await deleteOwnedTrade(
                  { mode: "live", userId: user.id, client: liveClient },
                  { tradeId: trade.id, symbol: trade.symbol, confirmSymbol },
                );
                setDeleting(false);
                if (!result.ok) {
                  setDeleteError(
                    result.skipped === "demo"
                      ? t("new.demoBlocked")
                      : result.code === "not_found"
                        ? t("detail.deleteDenied")
                        : result.error ?? t("detail.deleteFailed"),
                  );
                  return;
                }
                setConfirmOpen(false);
                setDeleteMessage(t("detail.deleted"));
                await refresh();
                navigate(`${JOURNAL_BASE}/trades`);
              }}
            >
              {t("detail.deleteTrade")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {trade.exclusionReason === "missing_executions" ? <HonestState kind="partial" /> : null}
      <Tabs defaultValue="summary">
        <TabsList className="inline-flex flex-wrap h-auto w-fit max-w-full">
          <TabsTrigger value="summary">{t("detail.summary")}</TabsTrigger>
          <TabsTrigger value="plan">{t("detail.plan")}</TabsTrigger>
          <TabsTrigger value="executions">{t("detail.executions")}</TabsTrigger>
          <TabsTrigger value="risk">{t("detail.risk")}</TabsTrigger>
          <TabsTrigger value="review">{t("detail.review")}</TabsTrigger>
          <TabsTrigger value="ai">{t("detail.ai")}</TabsTrigger>
          <TabsTrigger value="notes">{t("detail.notes")}</TabsTrigger>
          <TabsTrigger value="audit">{t("detail.audit")}</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <JournalPanel className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label={t("detail.gross")} value={signedMoney(calc.grossRealizedPnl, lang)} />
            <Field label={t("detail.net")} value={signedMoney(calc.netRealizedPnl, lang)} />
            <Field label={t("detail.entry")} value={calc.weightedAverageEntry != null ? formatMoney(calc.weightedAverageEntry, locale) : "—"} />
            <Field label={t("detail.exit")} value={calc.weightedAverageExit != null ? formatMoney(calc.weightedAverageExit, locale) : "—"} />
            <Field label={t("trades.remaining")} value={microsToNumber(calc.remainingQuantity).toFixed(0)} />
            <Field label={t("trades.r")} value={formatR(calc.rMultiple)} />
          </JournalPanel>
        </TabsContent>
        <TabsContent value="plan">
          <JournalPanel className="text-sm space-y-1">
            <Field label={t("new.plannedEntry")} value={risk.plannedEntry != null ? formatMoney(risk.plannedEntry, locale) : "—"} />
            <Field label={t("new.plannedStop")} value={risk.plannedStop != null ? formatMoney(risk.plannedStop, locale) : "—"} />
            <Field label={t("new.plannedTarget")} value={trade.plannedTarget != null ? String(trade.plannedTarget) : "—"} />
            <Field label={t("new.plannedRisk")} value={risk.plannedRisk != null ? money(risk.plannedRisk, lang) : "—"} />
            <Field label={t("detail.thesis")} value={trade.thesis ?? t("detail.noNotes")} />
          </JournalPanel>
        </TabsContent>
        <TabsContent value="executions">
          {trade.executions.length > 0 ? (
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
          ) : null}
        </TabsContent>
        <TabsContent value="risk">
          <TradeRiskPanel calc={calc} process={process} risk={risk} lang={lang} />
        </TabsContent>
        <TabsContent value="review">
          <JournalPanel className="text-sm">
            <p>{trade.reviewed ? t("review.complete") : t("review.inProgress")}</p>
            <Link className="text-accent-blue text-xs font-semibold" to={`${JOURNAL_BASE}/daily-review/${trade.sessionDate}`}>{t("nav.dailyReview")}</Link>
          </JournalPanel>
        </TabsContent>
        <TabsContent value="ai">
          <EvidenceCard
            demo={mode === "demo"}
            title={t("coach.title")}
            body={mode === "demo" ? t("detail.demoAi") : t("coach.empty")}
            tone="brand"
          />
        </TabsContent>
        <TabsContent value="notes">
          <TradeNotesPanel
            mode={mode}
            userId={user?.id}
            client={liveClient}
            tradeId={trade.id}
            thesis={trade.thesis ?? null}
          />
        </TabsContent>
        <TabsContent value="audit">
          <TradeAuditPanel audit={audit} mode={mode} lang={lang} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function TradeRiskPanel({
  calc,
  process,
  risk,
  lang,
}: {
  calc: ReturnType<typeof calculateTrade>;
  process: ReturnType<typeof calculateProcessScore>;
  risk: ReturnType<typeof buildTradeRiskEvidence>;
  lang: "en" | "es";
}) {
  const t = useJournalT();
  const locale = lang === "es" ? "es-ES" : "en-US";
  const sourceKey = `detail.riskSource.${risk.plannedRiskSource}` as JournalMessageKey;
  return (
    <JournalPanel className="text-sm grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="journal-risk-record">
      <Field label={t("new.plannedEntry")} value={risk.plannedEntry != null ? formatMoney(risk.plannedEntry, locale) : "—"} />
      <Field label={t("new.plannedStop")} value={risk.plannedStop != null ? formatMoney(risk.plannedStop, locale) : "—"} />
      <Field label={t("new.plannedSize")} value={risk.plannedQuantity != null ? microsToNumber(risk.plannedQuantity).toFixed(0) : "—"} />
      <Field label={t("detail.riskPerShare")} value={risk.riskPerShare != null ? money(risk.riskPerShare, lang) : "—"} />
      <Field label={t("new.plannedRisk")} value={risk.plannedRisk != null ? money(risk.plannedRisk, lang) : "—"} />
      <Field label={t("detail.netForR")} value={signedMoney(risk.netPnl, lang)} />
      <Field label={t("detail.rResult")} value={formatR(risk.rMultiple)} />
      <Field label={t("detail.plannedRiskSource")} value={t(sourceKey)} />
      <Field label={t("detail.calcVersion")} value={risk.calculationVersion} />
      <Field label={t("detail.inputVersion")} value={risk.inputVersion} />
      <Field label={t("detail.processVersion")} value={risk.processScoreVersion} />
      <Field label={t("kpi.processScore")} value={process.total != null ? String(process.total) : t("state.unavailable")} />
      <Field label={t("trades.openExposure")} value={microsToNumber(calc.remainingQuantity).toFixed(4)} />
    </JournalPanel>
  );
}

export function TradeAuditPanel({
  audit,
  mode,
  lang,
}: {
  audit: ReturnType<typeof buildTradeAuditRecord>;
  mode: string;
  lang: "en" | "es";
}) {
  const t = useJournalT();
  const sourceKey = `detail.riskSource.${audit.plannedRiskSource}` as JournalMessageKey;
  const eventKey = `detail.event.${audit.eventType}` as JournalMessageKey;
  return (
    <JournalPanel className="text-xs space-y-2" data-testid="journal-audit-record">
      <Field label={t("detail.calcVersion")} value={audit.calculationVersion} />
      <Field label={t("detail.inputVersion")} value={audit.inputVersion} />
      <Field label={t("detail.auditEvent")} value={t(eventKey)} />
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("detail.auditInputs")}</div>
        <ul className="font-semibold tabular-nums space-y-0.5">
          <li>{audit.inputSummary.symbol} · {audit.inputSummary.direction} · {audit.inputSummary.assetClass}</li>
          <li>{t("new.plannedEntry")}: {audit.inputSummary.plannedEntry ?? "—"}</li>
          <li>{t("new.plannedStop")}: {audit.inputSummary.plannedStop ?? "—"}</li>
          <li>{t("new.plannedSize")}: {audit.inputSummary.plannedSize ?? "—"}</li>
          <li>{t("detail.plannedRiskSource")}: {t(sourceKey)}</li>
          <li>
            {audit.inputSummary.executionCount === 1
              ? t("detail.executionsCount", { n: 1 })
              : t("detail.executionsCount.other", { n: audit.inputSummary.executionCount })}
          </li>
        </ul>
      </div>
      <Field label={t("detail.gross")} value={signedMoney(audit.grossPnl, lang)} />
      <Field label={t("trades.fees")} value={money(audit.fees, lang)} />
      <Field label={t("detail.net")} value={signedMoney(audit.netPnl, lang)} />
      <Field label={t("detail.rResult")} value={formatR(audit.rMultiple)} />
      <Field label={t("detail.auditTimestamp")} value={audit.timestamp} />
      <Field
        label={t("detail.auditDemo")}
        value={mode === "demo" ? t("detail.auditDemoBody") : t("detail.auditLiveBody")}
      />
      {audit.exclusions.length > 0 ? (
        <Field label={t("detail.lineage", { calc: audit.calculationVersion, input: audit.inputVersion })} value={audit.exclusions.join(", ")} />
      ) : null}
    </JournalPanel>
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
