import { Link, useNavigate } from "react-router-dom";
import { microsToNumber, sequenceMetrics } from "../calc";
import { KpiCard } from "../components/KpiCard";
import { HonestState } from "../components/HonestState";
import { StatusBadge } from "../components/StatusBadge";
import { useJournalLang, useJournalT } from "../i18n";
import { formatAverageR, money, pnlClass, pct, ratio, signedMoney } from "../lib/format";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function OverviewPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const navigate = useNavigate();
  const {
    mode, loading, error, refresh, trades, metrics, daily, calculations,
    processScore, equity, reconciliationState, dataQualityCount, missingReviews, showDemo, demoHidden,
  } = useJournalWorkspace();

  if (loading) return <HonestState kind="loading" />;
  if (error) return <HonestState kind="error" onRetry={() => void refresh()} />;
  if (mode === "empty") {
    return (
      <HonestState
        kind="empty"
        actions={
          <>
            <Link className="text-sm font-semibold text-accent-blue" to={`${JOURNAL_BASE}/settings?section=imports`}>{t("state.uploadCsv")}</Link>
            <Link className="text-sm font-semibold text-accent-blue" to={`${JOURNAL_BASE}/trades/new`}>{t("state.addTrade")}</Link>
            {demoHidden ? <button type="button" className="text-sm font-semibold text-accent-blue" onClick={showDemo}>{t("state.exploreDemo")}</button> : null}
          </>
        }
      />
    );
  }

  const lastDay = daily.at(-1);
  const cumulative = daily.reduce((sum, day) => sum + microsToNumber(day.netPnl), 0);
  const tone = metrics.netPnl > 0n ? "gain" : metrics.netPnl < 0n ? "loss" : "neutral";
  const avgDuration = mean(calculations.map((c) => c.holdingDurationMinutes).filter((n): n is number => n != null));
  const playbooks = groupPlaybooks(trades, calculations);
  const hours = timeOfDay(trades, calculations);
  const seq = sequenceMetrics(trades);
  const feeDrag = metrics.grossPnl === 0n ? null : microsToNumber(metrics.fees) / Math.abs(microsToNumber(metrics.grossPnl));
  const openCalcs = calculations.filter((c) => c.remainingQuantity > 0n);
  const matched = trades.filter((tr) => tr.planned !== false && !tr.ruleDeviation);
  const unplanned = trades.filter((tr) => tr.planned === false || tr.ruleDeviation);
  const matchedNet = matched.reduce((s, tr) => s + microsToNumber(calculations.find((c) => c.tradeId === tr.id)?.netRealizedPnl ?? 0n), 0);
  const unplannedNet = unplanned.reduce((s, tr) => s + microsToNumber(calculations.find((c) => c.tradeId === tr.id)?.netRealizedPnl ?? 0n), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t("overview.title")}</h1>
        <Link to={`${JOURNAL_BASE}/daily-review`} className="text-sm font-semibold text-accent-blue">{t("overview.startDay")}</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <KpiCard label={t("kpi.netPnl")} value={signedMoney(metrics.netPnl, lang)} sampleSize={metrics.sampleSize} definition={t("def.netPnl")} tone={tone} state={metrics.calculationState} onDrillDown={() => navigate(`${JOURNAL_BASE}/trades`)} />
        <KpiCard label={t("kpi.equity")} value={money(equity, lang)} sampleSize={metrics.sampleSize} definition={t("def.equity")} onDrillDown={() => navigate(`${JOURNAL_BASE}/settings?section=accounts`)} />
        <KpiCard label={t("kpi.profitFactor")} value={ratio(metrics.profitFactor)} sampleSize={metrics.sampleSize} definition={t("def.profitFactor")} />
        <KpiCard label={t("kpi.expectancy")} value={metrics.expectancyDollars != null ? signedMoney(metrics.expectancyDollars, lang) : "—"} sampleSize={metrics.sampleSize} definition={t("def.expectancy")} />
        <KpiCard label={t("kpi.averageR")} value={formatAverageR(metrics.averageR)} sampleSize={metrics.sampleSize} definition={t("def.averageR")} />
        <KpiCard label={t("kpi.processScore")} value={processScore != null ? String(processScore) : "—"} sampleSize={trades.length} definition={t("def.processScore")} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <KpiCard label={t("kpi.dailyPnl")} value={lastDay ? signedMoney(lastDay.netPnl, lang) : "—"} definition={t("def.dailyPnl")} tone={lastDay && lastDay.netPnl > 0n ? "gain" : lastDay && lastDay.netPnl < 0n ? "loss" : "neutral"} />
        <KpiCard label={t("kpi.cumulative")} value={moneyNumberSigned(cumulative, lang)} definition={t("def.cumulative")} />
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.openTrades")}</div>
          <div className="journal-card-sub">{t("trades.openExposure")}</div>
          <ul className="mt-2 space-y-1 text-xs">
            {openCalcs.slice(0, 4).map((calc) => (
              <li key={calc.tradeId} className="flex justify-between">
                <Link to={`${JOURNAL_BASE}/trades/${calc.tradeId}`} className="font-semibold">{calc.symbol}</Link>
                <span className="tabular-nums">{t("overview.openQty")} {microsToNumber(calc.remainingQuantity).toFixed(0)}</span>
              </li>
            ))}
            {openCalcs.length === 0 ? <li className="text-muted-foreground">{t("state.noTrades")}</li> : null}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="journal-card p-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="journal-card-hd">{t("overview.calendarPreview")}</div>
            <Link to={`${JOURNAL_BASE}/calendar`} className="text-xs font-semibold text-accent-blue">{t("overview.viewCalendar")}</Link>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {daily.slice(-14).map((day) => (
              <Link key={day.date} to={`${JOURNAL_BASE}/daily-review/${day.date}`} className={`journal-cal-cell ${cellClass(microsToNumber(day.netPnl))} ${missingReviews.has(day.date) ? "journal-cal-missing" : ""}`}>
                <span className="text-[11px]">{day.date.slice(8)}</span>
                <span className={`text-[11px] font-bold tabular-nums ${pnlClass(day.netPnl)}`}>{signedMoney(day.netPnl, lang)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.timeOfDay")}</div>
          <div className="mt-2 space-y-1">
            {hours.map((bucket) => (
              <div key={bucket.hour} className="flex items-center gap-2 text-[11px]">
                <span className="w-10 tabular-nums text-muted-foreground">{bucket.hour}:00</span>
                <div className="tod-track flex-1 h-2 rounded bg-muted overflow-hidden">
                  <div className={bucket.net >= 0 ? "h-full bg-green" : "h-full bg-red"} style={{ width: `${Math.min(100, Math.abs(bucket.net) / Math.max(1, hours[0]?.abs || 1) * 100)}%` }} />
                </div>
                <span className={`tabular-nums ${bucket.net >= 0 ? "journal-gain" : "journal-loss"}`}>{moneyNumberSigned(bucket.net, lang)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.riskRules")}</div>
          <p className="text-xs mt-2">{t("review.followed", { n: matched.length })} · {t("review.deviations", { n: unplanned.length })}</p>
        </div>
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.strength")}</div>
          <p className="text-xs mt-2">{mode === "demo" ? t("strength.demo") : t("state.unavailable")}</p>
        </div>
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.leak")}</div>
          <p className="text-xs mt-2">{mode === "demo" ? t("leak.demo") : t("state.unavailable")}</p>
        </div>
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.commitment")}</div>
          <p className="text-xs mt-2">{mode === "demo" ? t("commitment.demo") : t("state.unavailable")}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <KpiCard label={t("overview.avgWinLoss")} value={`${metrics.averageWin != null ? signedMoney(metrics.averageWin, lang) : "—"} / ${metrics.averageLoss != null ? signedMoney(metrics.averageLoss, lang) : "—"}`} sampleSize={metrics.sampleSize} definition={t("def.avgWinLoss")} />
        <KpiCard label={t("overview.duration")} value={avgDuration != null ? t("overview.minutes", { n: Math.round(avgDuration) }) : "—"} sampleSize={metrics.sampleSize} definition={t("def.duration")} />
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.playbook")}</div>
          <ul className="mt-2 space-y-2">
            {playbooks.map((row) => (
              <li key={row.name}>
                <div className="flex justify-between text-xs"><span>{row.name}</span><span className={`tabular-nums ${row.net >= 0 ? "journal-gain" : "journal-loss"}`}>{moneyNumberSigned(row.net, lang)}</span></div>
                <div className="journal-progress mt-1"><span style={{ width: `${Math.min(100, row.share * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("overview.sequence")}</div>
          <p className="text-xs mt-2 tabular-nums">{seq.filter((s) => s.priorResult === "win").length}W → next · {seq.filter((s) => s.priorResult === "loss").length}L → next</p>
        </div>
        <KpiCard label={t("overview.feeDrag")} value={pct(feeDrag)} definition={t("def.feeDrag")} sampleSize={metrics.sampleSize} />
        <KpiCard label={t("overview.reconciliation")} value={reconciliationState.state} definition={t("def.reconciliation")} tone={reconciliationState.state === "mismatch" ? "warn" : "neutral"} />
        <KpiCard label={t("overview.dataQuality")} value={t("overview.issues", { n: dataQualityCount })} definition={t("def.dataQuality")} state="data-quality" onDrillDown={() => navigate(`${JOURNAL_BASE}/settings?section=data-quality`)} />
      </div>
      <div className="journal-card p-3">
        <div className="journal-card-hd">{t("overview.recent")}</div>
        <p className="text-xs text-muted-foreground mt-1">{t("overview.followedPlan")} {moneyNumberSigned(matchedNet, lang)} · {t("overview.unplanned")} {moneyNumberSigned(unplannedNet, lang)}</p>
        <ul className="mt-2 divide-y">
          {calculations.filter((c) => c.remainingQuantity === 0n).slice(-6).reverse().map((calc) => (
            <li key={calc.tradeId} className="py-1.5 flex items-center justify-between text-xs">
              <Link to={`${JOURNAL_BASE}/trades/${calc.tradeId}`} className="font-semibold">{calc.symbol}</Link>
              <StatusBadge outcome={calc.outcome} />
              <span className={`tabular-nums ${pnlClass(calc.netRealizedPnl)}`}>{signedMoney(calc.netRealizedPnl, lang)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function moneyNumberSigned(value: number, language: string) {
  const abs = Math.abs(value).toLocaleString(language === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" });
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function cellClass(net: number) {
  if (net > 400) return "journal-cal-gain-str";
  if (net > 0) return "journal-cal-gain";
  if (net < -400) return "journal-cal-loss-str";
  if (net < 0) return "journal-cal-loss";
  return "journal-cal-empty";
}

function groupPlaybooks(trades: { id: string; playbookName?: string | null }[], calcs: { tradeId: string; netRealizedPnl: bigint }[]) {
  const map = new Map<string, number>();
  for (const trade of trades) {
    const net = Number(calcs.find((c) => c.tradeId === trade.id)?.netRealizedPnl ?? 0n) / 1_000_000;
    const name = trade.playbookName || "—";
    map.set(name, (map.get(name) ?? 0) + net);
  }
  const rows = [...map.entries()].map(([name, net]) => ({ name, net, abs: Math.abs(net) }));
  const max = Math.max(1, ...rows.map((r) => r.abs));
  return rows.sort((a, b) => b.abs - a.abs).map((r) => ({ ...r, share: r.abs / max }));
}

function timeOfDay(
  trades: { id: string; executions: { timestampUtc: string }[] }[],
  calcs: { tradeId: string; netRealizedPnl: bigint }[],
) {
  const buckets = new Map<number, number>();
  for (const trade of trades) {
    const hour = new Date(trade.executions[0]?.timestampUtc ?? 0).getUTCHours();
    const net = Number(calcs.find((c) => c.tradeId === trade.id)?.netRealizedPnl ?? 0n) / 1_000_000;
    buckets.set(hour, (buckets.get(hour) ?? 0) + net);
  }
  const rows = [...buckets.entries()].map(([hour, net]) => ({ hour, net, abs: Math.abs(net) }));
  const max = Math.max(1, ...rows.map((r) => r.abs));
  return rows.sort((a, b) => a.hour - b.hour).map((r) => ({ ...r, abs: max }));
}
