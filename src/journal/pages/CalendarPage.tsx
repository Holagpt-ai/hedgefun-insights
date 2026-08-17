import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { microsToNumber } from "../calc";
import { HonestState } from "../components/HonestState";
import { useJournalLang, useJournalT } from "../i18n";
import { signedMoney } from "../lib/format";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function CalendarPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const { daily, missingReviews, loading, mode } = useJournalWorkspace();
  const [cursor, setCursor] = useState(() => mode === "demo" ? new Date(Date.UTC(2026, 7, 1)) : new Date());

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const grid = useMemo(() => buildMonth(year, month, daily, missingReviews), [year, month, daily, missingReviews]);

  if (loading) return <HonestState kind="loading" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t("calendar.title")}</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(Date.UTC(year, month - 1, 1)))}>{t("calendar.prev")}</Button>
          <div className="text-sm font-semibold tabular-nums">{cursor.toLocaleString(lang === "es" ? "es-ES" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(Date.UTC(year, month + 1, 1)))}>{t("calendar.next")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="journal-badge journal-badge-gain">{t("calendar.legendGain")}</span>
        <span className="journal-badge journal-badge-loss">{t("calendar.legendLoss")}</span>
        <span className="journal-badge journal-badge-neu">{t("calendar.legendEmpty")}</span>
        <span className="journal-badge journal-badge-warn">{t("calendar.legendMissing")}</span>
      </div>
      <div className="journal-card p-3">
        <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold text-muted-foreground mb-1">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => <div key={d}>{t(`weekday.${d}` as "weekday.0")}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell) => {
            if (cell.kind === "pad") return <div key={cell.key} />;
            if (cell.kind === "weekend") {
              return (
                <div key={cell.key} className="journal-cal-cell journal-cal-closed">
                  <span>{cell.day}</span>
                  <span className="text-[10px] text-muted-foreground">{t("calendar.weekend")}</span>
                </div>
              );
            }
            const cls = cell.net == null ? "journal-cal-empty" : cell.net > 400 ? "journal-cal-gain-str" : cell.net > 0 ? "journal-cal-gain" : cell.net < -400 ? "journal-cal-loss-str" : cell.net < 0 ? "journal-cal-loss" : "journal-cal-empty";
            return (
              <Link
                key={cell.key}
                to={`${JOURNAL_BASE}/daily-review/${cell.iso}`}
                className={`journal-cal-cell ${cls} ${cell.missing ? "journal-cal-missing" : ""}`}
              >
                <span className="text-[11px]">{cell.day}</span>
                {cell.net != null ? (
                  <>
                    <span className={`text-[11px] font-bold tabular-nums ${cell.net >= 0 ? "journal-gain" : "journal-loss"}`}>
                      {signedMoney(BigInt(Math.round(cell.net * 1_000_000)), lang)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{cell.count} {t("calendar.trades").toLowerCase()}</span>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{t("calendar.noTrade")}</span>
                )}
                {cell.missing ? <span className="text-[10px] journal-warn">{t("calendar.missingReview")}</span> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildMonth(
  year: number,
  month: number,
  daily: { date: string; netPnl: bigint; tradeCount: number }[],
  missing: Set<string>,
) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<
    | { kind: "pad"; key: string }
    | { kind: "weekend"; key: string; day: number }
    | { kind: "day"; key: string; day: number; iso: string; net: number | null; count: number; missing: boolean }
  > = [];
  for (let i = 0; i < startPad; i += 1) cells.push({ kind: "pad", key: `p-${i}` });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const iso = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    const metric = byDate.get(iso);
    if ((dow === 0 || dow === 6) && !metric) {
      cells.push({ kind: "weekend", key: iso, day });
      continue;
    }
    cells.push({
      kind: "day",
      key: iso,
      day,
      iso,
      net: metric ? microsToNumber(metric.netPnl) : null,
      count: metric?.tradeCount ?? 0,
      missing: missing.has(iso),
    });
  }
  return cells;
}
