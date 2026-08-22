import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { aggregateTrades, calculateTrade } from "../calc";
import { EvidenceCard } from "../components/EvidenceCard";
import { HonestState } from "../components/HonestState";
import { StatusBadge } from "../components/StatusBadge";
import { AUGUST_14_TRADES } from "../demo/august-fixtures";
import { journalCount, useJournalLang, useJournalT } from "../i18n";
import { REST_DAYS_KEY, readJson, writeJson } from "../lib/storage";
import { money, signedMoney } from "../lib/format";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

const SECTIONS = 7;

export function DailyReviewPage() {
  const { date } = useParams();
  const t = useJournalT();
  const lang = useJournalLang();
  const { trades, daily, mode, missingReviews } = useJournalWorkspace();
  const [restDays, setRestDays] = useState<string[]>(() => readJson(REST_DAYS_KEY, []));
  const selected = date ?? (mode === "demo" ? "2026-08-14" : daily.at(-1)?.date);

  const sessionTrades = useMemo(
    () => trades.filter((trade) => (trade.sessionDate ?? trade.executions[0]?.timestampUtc.slice(0, 10)) === selected),
    [trades, selected],
  );
  const calcs = sessionTrades.map(calculateTrade);
  const metrics = aggregateTrades(sessionTrades);
  const isRest = selected ? restDays.includes(selected) : false;

  if (!selected) {
    return <HonestState kind="empty" title={t("review.pickDate")} body={t("review.noSession")} />;
  }

  if (sessionTrades.length === 0 || isRest) {
    return (
      <div className="space-y-3">
        <Header date={selected} />
        <HonestState
          kind="empty"
          title={t("state.restDay")}
          body={t("review.restSupport")}
          actions={
            <Button size="sm" variant="outline" onClick={() => toggleRest(selected, restDays, setRestDays)}>
              {t("review.markRest")}
            </Button>
          }
        />
      </div>
    );
  }

  const isAug14Demo = mode === "demo" && selected === "2026-08-14";
  const followed = sessionTrades.filter((tr) => tr.planned !== false && !tr.ruleDeviation).length;
  const deviations = sessionTrades.filter((tr) => tr.planned === false || tr.ruleDeviation).length;
  const violated = 0;
  const screenshotsPending = isAug14Demo;
  const done = isAug14Demo ? 6 : sessionTrades.every((tr) => tr.reviewed) ? SECTIONS : 4;
  const adherence = isAug14Demo ? 78 : Math.round((followed / Math.max(1, sessionTrades.length)) * 100);

  const matched = sessionTrades.filter((tr) => tr.planned !== false && !tr.ruleDeviation);
  const unplanned = sessionTrades.filter((tr) => tr.planned === false || tr.ruleDeviation);
  const matchedNet = aggregateTrades(matched).netPnl;
  const unplannedNet = aggregateTrades(unplanned).netPnl;

  return (
    <div className="space-y-3">
      <Header date={selected} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={done < SECTIONS ? t("review.inProgress") : t("review.complete")} tone={done < SECTIONS ? "warn" : "gain"} />
        <span className="text-xs">{t("review.sections", { done, total: SECTIONS })}</span>
        {screenshotsPending ? <span className="journal-badge journal-badge-warn">{t("review.screenshotsPending")}</span> : null}
        {missingReviews.has(selected) ? <span className="journal-badge journal-badge-warn">{t("calendar.missingReview")}</span> : null}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label={t("review.sessionNet")} value={signedMoney(metrics.netPnl, lang)} />
        <Stat label={t("review.matchedPlan")} value={signedMoney(matchedNet, lang)} />
        <Stat label={t("review.unplannedCost")} value={signedMoney(unplannedNet, lang)} />
        <Stat label={t("review.adherence")} value={`${adherence}%`} />
        <Stat label={journalCount(lang, "review.followed", followed)} value={`${journalCount(lang, "review.deviation", deviations)} · ${journalCount(lang, "review.violated", violated)}`} />
      </div>
      {isAug14Demo ? (
        <p className="text-xs text-muted-foreground">
          {t("review.matchedPlan")} +$1,250 vs PLTR −$130 = {signedMoney(aggregateTrades(AUGUST_14_TRADES).netPnl, lang)}
        </p>
      ) : null}
      <div className="journal-card p-3">
        <div className="journal-card-hd">{t("review.planVsActual")}</div>
        <ul className="mt-2 space-y-1 text-xs">
          {calcs.map((calc) => {
            const trade = sessionTrades.find((tr) => tr.id === calc.tradeId);
            return (
              <li key={calc.tradeId} className="flex items-center justify-between gap-2">
                <Link to={`${JOURNAL_BASE}/trades/${calc.tradeId}`} className="font-semibold">{calc.symbol}</Link>
                <StatusBadge outcome={calc.outcome} />
                <span className="tabular-nums">{signedMoney(calc.netRealizedPnl, lang)}</span>
                <span className="text-muted-foreground">{trade?.planned === false ? t("overview.unplanned") : t("overview.followedPlan")}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="journal-card p-3">
        <div className="journal-card-hd">{t("review.timeline")}</div>
        <ul className="mt-2 space-y-2 text-xs">
          {sessionTrades.flatMap((trade) => trade.executions.map((ex) => (
            <li key={ex.id} className="flex justify-between">
              <span className="tabular-nums text-muted-foreground">{ex.timestampUtc.slice(11, 16)} UTC</span>
              <span className="font-semibold">{trade.symbol} {ex.action}</span>
              <span className="tabular-nums">{ex.quantity} @ {ex.price}</span>
            </li>
          )))}
        </ul>
      </div>
      <div className="journal-card p-3 space-y-2">
        <div className="journal-card-hd">{t("review.notes")}</div>
        <Textarea rows={4} defaultValue={isAug14Demo ? "Waited for confirmation on every planned setup before entry. Screenshots still required to complete review." : ""} />
      </div>
      <EvidenceCard
        demo={mode === "demo"}
        tone="brand"
        title={t("review.ai")}
        body={isAug14Demo
          ? "Plan adherence: matched-plan trades generated +$1,250 net (NVDA +$440, SPY +$650, AAPL +$120, TSLA +$40). Unplanned PLTR deviation cost −$130. Total net +$1,120 (Gross $1,158 − Fees $38)."
          : `${t("review.sessionNet")} ${money(metrics.netPnl, lang)}. ${t("kpi.sample")} ${metrics.sampleSize}.`}
        links={calcs.slice(0, 3).map((c) => ({ label: c.symbol, href: `${JOURNAL_BASE}/trades/${c.tradeId}` }))}
      />
    </div>
  );
}

function Header({ date }: { date: string }) {
  const t = useJournalT();
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-lg font-bold">{t("review.title")} · {date}</h1>
      <Link to={`${JOURNAL_BASE}/calendar`} className="text-xs font-semibold text-accent-blue">{t("nav.calendar")}</Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="journal-kpi">
      <div className="journal-kpi-label">{label}</div>
      <div className="journal-kpi-value text-[16px]">{value}</div>
    </div>
  );
}

function toggleRest(date: string, current: string[], setRestDays: (next: string[]) => void) {
  const next = current.includes(date) ? current.filter((d) => d !== date) : [...current, date];
  writeJson(REST_DAYS_KEY, next);
  setRestDays(next);
}
