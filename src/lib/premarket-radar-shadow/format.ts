import type {
  PremarketShadowReport,
  ProductionRow,
  ShadowCandidate,
} from "./types";

function fmtShares(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "unavailable";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtDollar(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "unavailable";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "unavailable";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "unavailable";
  const mins = Math.round(ms / 60_000);
  if (Math.abs(mins) < 1) return `${Math.round(ms / 1000)}s`;
  if (Math.abs(mins) < 120) return `${mins}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

function productionLine(row: ProductionRow): string {
  return `${row.rank}. ${row.symbol} | vol=${fmtShares(row.volume)} | ${fmtPct(row.changePct)} | price=${row.price ?? "unavailable"}`;
}

function shadowLine(row: ShadowCandidate): string {
  const cat = row.catalyst.present
    ? `Catalyst: ${row.catalyst.eventType ?? "event"}, ${fmtAge(row.catalyst.ageMs)} old`
    : "Catalyst: none";
  const hod =
    row.hodDistancePct === null ? "HOD distance: unavailable" : `HOD distance: ${row.hodDistancePct.toFixed(1)}%`;
  return [
    `${row.rank}. ${row.symbol} | ${fmtShares(row.cumulativeVolume)} | ${fmtPct(row.changePct)} | ${fmtDollar(row.cumulativeDollarVolume)} dollar vol`,
    `   5m: ${fmtShares(row.volumeComp.vol5)}`,
    `   15m: ${fmtShares(row.volumeComp.vol15)}`,
    `   30m: ${fmtShares(row.volumeComp.vol30)}  60m: ${fmtShares(row.volumeComp.vol60)}`,
    `   ${hod}`,
    `   ${cat}`,
    `   price_src=${row.priceSource ?? "unavailable"} day.c_move=${fmtPct(row.priceComp.daySessionMovePct)} lastTrade_move=${fmtPct(row.priceComp.lastTradeMovePct)} min.c_move=${fmtPct(row.priceComp.minCloseMovePct)}`,
    `   day.v=${fmtShares(row.volumeComp.dayV)} bar_cum=${fmtShares(row.volumeComp.barCumulative)} day.v/bar=${row.volumeComp.dayVOverBar === null ? "unavailable" : row.volumeComp.dayVOverBar.toFixed(2)}`,
    `   quality=${row.qualityFlags.join(",") || "none"} lifecycle=${row.lifecycle ?? "unlabeled"} ts=${row.providerTimestampIso ?? "unavailable"}`,
  ].join("\n");
}

function listOrEmpty(rows: ProductionRow[]): string[] {
  if (rows.length === 0) return ["(empty)"];
  return rows.map(productionLine);
}

/**
 * Deterministic text report. Facts only — no generated narrative.
 */
export function formatPremarketShadowReport(r: PremarketShadowReport): string {
  if (r.status === "not_applicable" && r.gate.ok === false) {
    return [
      `AM SHADOW — ${r.gate.etTimeLabel}`,
      `status=not_applicable`,
      `reason=${r.gate.reason}`,
      `session_date=${r.gate.sessionDate}`,
      `detail=${r.gate.detail}`,
      `next=${r.gate.nextCaptureHint}`,
      `live_capture=not_run`,
      `field_findings=unavailable (no in-window snapshot)`,
    ].join("\n");
  }

  const et =
    r.gate.ok === true ? r.gate.window.etTimeLabel : r.evaluatedAtIso;
  const shadow = r.shadowQualifiedTop.slice(0, 3);
  const shadowLines =
    shadow.length === 0 ? ["(empty)"] : shadow.map(shadowLine);
  const missLines =
    r.productionExclusions.length === 0
      ? ["(none)"]
      : r.productionExclusions.map((e) => e.summary);
  const ratioLines =
    r.ratioOnlyExclusions.length === 0
      ? ["(none)"]
      : r.ratioOnlyExclusions.map((s) => `${s} — excluded only by prior-session volume ratio`);
  const div = r.fieldDivergence;
  const divLines = div
    ? [
        `sample=${div.sampleSize}`,
        `day.c_near_prev_close=${div.dayCNearPrevCloseCount}`,
        `lastTrade_move_ge_10=${div.lastTradeMoveGe10Count}`,
        `min.c_move_ge_10=${div.minMoveGe10Count}`,
        `day.v_much_larger_than_bar=${div.dayVMuchLargerThanBarCount}`,
        `median_day.v_over_bar=${div.medianDayVOverBar === null ? "unavailable" : div.medianDayVOverBar.toFixed(2)}`,
      ]
    : ["unavailable"];

  return [
    `AM SHADOW — ${et}`,
    `status=${r.status}`,
    `evaluated_at_utc=${r.evaluatedAtIso}`,
    "",
    "Current production Day-Trade Radar:",
    `source=screener_results.day_trade_radar persisted=${r.productionPersistedStatus}`,
    ...listOrEmpty(r.productionPersistedTop3),
    "",
    "Live snapshot applied through current Day-Trade Radar filters:",
    ...listOrEmpty(r.productionLiveDtrTop3),
    "",
    "Pre-Market shadow by cumulative volume:",
    ...shadowLines,
    "",
    "Production misses:",
    ...missLines,
    "",
    "Lost only to prior-session volume ratio:",
    ...ratioLines,
    "",
    "Missing / incomplete provider fields:",
    ...(r.missingData.length === 0
      ? ["(none)"]
      : r.missingData.slice(0, 20).map((c) => `${c.symbol} flags=${c.qualityFlags.join(",")}`)),
    "",
    "Polygon field divergence (shadow volume universe):",
    ...divLines,
    "",
    ...r.notes,
  ].join("\n");
}
