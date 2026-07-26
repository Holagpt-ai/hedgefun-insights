import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  ageMinutes,
  buildChecklist,
  dedupeCatalyst,
  emptySection,
  etParts,
  finiteOrNull,
  isCurrentPremarketAnalysis,
  isHttpsUrl,
  isProviderReported,
  mapMarketStatus,
  normalizeSymbol,
  normalizeTimeOfDay,
  positiveOrNull,
  sortByVolumeDesc,
  unavailableSection,
} from "./contract.ts";

Deno.test("ET date is correct across UTC midnight", () => {
  // 2026-07-27T02:30:00Z is still 2026-07-26 in ET
  assertEquals(etParts(new Date("2026-07-27T02:30:00Z")).date, "2026-07-26");
});

Deno.test("DST does not shift the ET calendar date", () => {
  // EST (winter) and EDT (summer) both resolve the correct local date
  assertEquals(etParts(new Date("2026-01-15T14:00:00Z")).date, "2026-01-15");
  assertEquals(etParts(new Date("2026-07-15T14:00:00Z")).date, "2026-07-15");
  // 03:30Z in winter is previous ET day
  assertEquals(etParts(new Date("2026-01-15T03:30:00Z")).date, "2026-01-14");
});

Deno.test("weekend returns non_trading_day", () => {
  assertEquals(
    mapMarketStatus({ market: "closed" }, { weekday: "Sat", upcomingClosedToday: false }),
    "non_trading_day",
  );
});

Deno.test("full holiday fails closed to non_trading_day", () => {
  assertEquals(
    mapMarketStatus({ market: "open" }, { weekday: "Thu", upcomingClosedToday: true }),
    "non_trading_day",
  );
});

Deno.test("ambiguous provider payload returns unavailable", () => {
  assertEquals(mapMarketStatus(null, { weekday: "Thu", upcomingClosedToday: false }), "unavailable");
  assertEquals(mapMarketStatus({}, { weekday: "Thu", upcomingClosedToday: false }), "unavailable");
  assertEquals(mapMarketStatus({ market: "weird" }, { weekday: "Thu", upcomingClosedToday: false }), "unavailable");
});

Deno.test("premarket / regular / afterhours map correctly", () => {
  const w = { weekday: "Thu", upcomingClosedToday: false };
  assertEquals(mapMarketStatus({ market: "extended-hours", earlyHours: true }, w), "premarket");
  assertEquals(mapMarketStatus({ market: "open" }, w), "regular");
  assertEquals(mapMarketStatus({ market: "extended-hours", afterHours: true }, w), "afterhours");
  assertEquals(mapMarketStatus({ market: "closed" }, w), "closed");
});

Deno.test("only current premarket analyses qualify", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  const base = { session_type: "premarket", session_date: "2026-07-27", valid_through: "2026-07-27T13:00:00Z" };
  assertEquals(isCurrentPremarketAnalysis(base, "2026-07-27", now), true);
  // expired
  assertEquals(isCurrentPremarketAnalysis({ ...base, valid_through: "2026-07-27T11:00:00Z" }, "2026-07-27", now), false);
  // RTH
  assertEquals(isCurrentPremarketAnalysis({ ...base, session_type: "rth" }, "2026-07-27", now), false);
  // post-close
  assertEquals(isCurrentPremarketAnalysis({ ...base, session_type: "postclose" }, "2026-07-27", now), false);
  // wrong session date
  assertEquals(isCurrentPremarketAnalysis({ ...base, session_date: "2026-07-24" }, "2026-07-27", now), false);
  // unparsable valid_through
  assertEquals(isCurrentPremarketAnalysis({ ...base, valid_through: "nope" }, "2026-07-27", now), false);
});

Deno.test("volume DESC with null volume last", () => {
  const rows = [
    { s: "A", volume: null, change_pct: 1 },
    { s: "B", volume: 100, change_pct: 1 },
    { s: "C", volume: 900, change_pct: 1 },
    { s: "D", volume: null, change_pct: 9 },
  ];
  assertEquals(sortByVolumeDesc(rows).map((r) => r.s), ["C", "B", "D", "A"]);
});

Deno.test("tie on volume breaks on absolute move, order otherwise stable", () => {
  const rows = [
    { s: "A", volume: 500, change_pct: -1 },
    { s: "B", volume: 500, change_pct: 7 },
  ];
  assertEquals(sortByVolumeDesc(rows).map((r) => r.s), ["B", "A"]);
});

Deno.test("provider_reported filter is enforced", () => {
  assertEquals(isProviderReported({ verification_state: "provider_reported" }), true);
  assertEquals(isProviderReported({ verification_state: "inferred" }), false);
  assertEquals(isProviderReported({}), false);
});

Deno.test("catalyst dedupe keeps one row per dedupe_key", () => {
  const rows = [
    { id: "1", dedupe_key: "k1" },
    { id: "2", dedupe_key: "k1" },
    { id: "3", dedupe_key: "k2" },
  ];
  assertEquals(dedupeCatalyst(rows).map((r) => r.id), ["1", "3"]);
});

Deno.test("date-only earnings never receives an invented exact time", () => {
  assertEquals(normalizeTimeOfDay("before_open"), "before_open");
  assertEquals(normalizeTimeOfDay("unknown"), null);
  assertEquals(normalizeTimeOfDay(undefined), null);
  assertEquals(normalizeTimeOfDay("9:30am"), null);
});

Deno.test("empty and failed sections produce different envelopes", () => {
  const e = emptySection<number[]>([], "NO_QUALIFYING_DATA");
  const u = unavailableSection<number[]>([], "QUERY_FAILED");
  assertEquals(e.status, "empty");
  assertEquals(u.status, "unavailable");
  assertEquals(e.reason_code, "NO_QUALIFYING_DATA");
  assertEquals(u.reason_code, "QUERY_FAILED");
});

Deno.test("stale detection by age", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  assertEquals(Math.round(ageMinutes("2026-07-27T11:00:00Z", now)!), 60);
  assertEquals(ageMinutes(null, now), null);
  assertEquals(ageMinutes("garbage", now), null);
});

Deno.test("missing numerics stay null and never become zero", () => {
  assertEquals(finiteOrNull(undefined), null);
  assertEquals(finiteOrNull(null), null);
  assertEquals(finiteOrNull("abc"), null);
  assertEquals(finiteOrNull(0), 0);
  assertEquals(positiveOrNull(0), null);
  assertEquals(positiveOrNull(-3), null);
  assertEquals(positiveOrNull(12.5), 12.5);
});

Deno.test("checklist counts match only actual source rows", () => {
  const items = buildChecklist({
    watchlistPremarketCount: 2,
    catalystTodayCount: 0,
    beforeOpenEarningsCount: 1,
    awaitingRefreshCount: 0,
    journalMissingRiskCount: 3,
    volumeLeaderCount: 0,
  });
  assertEquals(items.map((i) => i.id), ["watchlist_premarket", "earnings_before_open", "journal_risk"]);
  assertEquals(items[0].label, "Review 2 current Watchlist Pre-Market names");
  assertEquals(items[1].label, "Review 1 before-open earnings event");
  assertEquals(items[2].count, 3);
});

Deno.test("checklist emits nothing when no data supports an item", () => {
  assertEquals(
    buildChecklist({
      watchlistPremarketCount: 0,
      catalystTodayCount: 0,
      beforeOpenEarningsCount: 0,
      awaitingRefreshCount: 0,
      journalMissingRiskCount: 0,
      volumeLeaderCount: 0,
    }).length,
    0,
  );
});

Deno.test("symbols normalize and invalid symbols are rejected", () => {
  assertEquals(normalizeSymbol(" aapl "), "AAPL");
  assertEquals(normalizeSymbol("BRK.B"), "BRK.B");
  assertEquals(normalizeSymbol("1BAD"), null);
  assertEquals(normalizeSymbol(""), null);
  assertEquals(normalizeSymbol(42), null);
});

Deno.test("only https source URLs are accepted", () => {
  assertEquals(isHttpsUrl("https://example.com/a"), true);
  assertEquals(isHttpsUrl("http://example.com/a"), false);
  assertEquals(isHttpsUrl("javascript:alert(1)"), false);
  assertEquals(isHttpsUrl(null), false);
});

// ---------------------------------------------------------------- P1-R1

import {
  derivedSectionStatus,
  etDateShift,
  isUsableVolumeRow,
  lifecycleLabel,
  latestRequestByTicker,
  missingSymbols,
  nextKnownSessionFrom,
  normalizeDirection,
  normalizeSide,
  resolveMarketContext,
  sanitizeAlerts,
  sanitizeMarketSignals,
  validateCalendarRows,
} from "./contract.ts";

const CAL_OK = [
  { date: "2026-07-27", status: "open", exchange: "NYSE", open: "2026-07-27T13:30:00Z", close: "2026-07-27T20:00:00Z" },
  { date: "2026-07-27", status: "open", exchange: "NASDAQ", open: "2026-07-27T13:30:00Z", close: "2026-07-27T20:00:00Z" },
  { date: "2026-07-28", status: "open", exchange: "NYSE", open: "2026-07-28T13:30:00Z", close: null },
];
const NOW_OK = { market: "extended-hours", earlyHours: true, serverTime: "2026-07-27T08:00:00-04:00" };

Deno.test("ET date shift is calendar-accurate across month end", () => {
  assertEquals(etDateShift("2026-08-01", -2), "2026-07-30");
  assertEquals(etDateShift("garbage", -1), "garbage");
});

Deno.test("calendar validation fails closed on partial rows", () => {
  assertEquals(validateCalendarRows(null).ok, false);
  assertEquals(validateCalendarRows([{ date: "2026-07-27", status: "open" }]).ok, false);
  assertEquals(validateCalendarRows(CAL_OK).ok, true);
});

Deno.test("missing calendar never yields a session", () => {
  const r = resolveMarketContext({ nowBody: NOW_OK, calendarBody: null, etDate: "2026-07-27", etWeekday: "Mon" });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_UNAVAILABLE");
  assertEquals(r.source, null);
});

Deno.test("contradictory exchange rows fail closed", () => {
  const cal = [
    { date: "2026-07-27", status: "open", exchange: "NYSE", open: null, close: null },
    { date: "2026-07-27", status: "closed", exchange: "NASDAQ", open: null, close: null },
  ];
  const r = resolveMarketContext({ nowBody: NOW_OK, calendarBody: cal, etDate: "2026-07-27", etWeekday: "Mon" });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_CONTRADICTORY");
});

Deno.test("provider serverTime without ET offset fails closed", () => {
  const r = resolveMarketContext({
    nowBody: { market: "open", serverTime: "not-a-time" },
    calendarBody: CAL_OK,
    etDate: "2026-07-27",
    etWeekday: "Mon",
  });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "PROVIDER_TIME_INVALID");
});

Deno.test("valid evidence resolves premarket and next known session", () => {
  const r = resolveMarketContext({ nowBody: NOW_OK, calendarBody: CAL_OK, etDate: "2026-07-27", etWeekday: "Mon" });
  assertEquals(r.status, "premarket");
  assertEquals(r.reason_code, null);
  assertEquals(r.source, "polygon_marketstatus");
  assertEquals(r.official_open_at, "2026-07-27T13:30:00Z");
  assertEquals(r.next_known_session_at, "2026-07-28T13:30:00Z");
});

Deno.test("non-premarket sessions are labeled OUTSIDE_PREMARKET", () => {
  const r = resolveMarketContext({
    nowBody: { market: "open", serverTime: "2026-07-27T10:00:00-04:00" },
    calendarBody: CAL_OK,
    etDate: "2026-07-27",
    etWeekday: "Mon",
  });
  assertEquals(r.status, "regular");
  assertEquals(r.reason_code, "OUTSIDE_PREMARKET");
});

Deno.test("next known session ignores closed and open-less rows", () => {
  assertEquals(nextKnownSessionFrom([{ date: "2026-07-28", status: "closed", exchange: "NYSE", open: "x", close: null }], "2026-07-27"), null);
});

Deno.test("only authorized signals with labels render", () => {
  const out = sanitizeMarketSignals([
    { signal_id: "hod_break", label: "New session high", direction: "bullish" },
    { signal_id: "hod_break", label: "dupe", direction: "bullish" },
    { signal_id: "made_up", label: "Nope", direction: "bullish" },
    { signal_id: "lod_break", label: "", direction: "bearish" },
    { signal_id: "lod_break", label: "Session low", direction: "sideways" },
  ], { unavailable: false });
  assertEquals(out.length, 1);
  assertEquals(out[0].signal_id, "hod_break");
});

Deno.test("data unavailable rows expose no signals", () => {
  assertEquals(
    sanitizeMarketSignals([{ signal_id: "hod_break", label: "x", direction: "bullish" }], { unavailable: true }).length,
    0,
  );
});

Deno.test("unknown direction becomes data_unavailable", () => {
  assertEquals(normalizeDirection("moon"), "data_unavailable");
  assertEquals(normalizeDirection("bearish"), "bearish");
});

Deno.test("request lifecycle uses the newest real row", () => {
  const m = latestRequestByTicker([
    { ticker: "AAPL", status: "failed", created_at: "2026-07-27T10:00:00Z", error_code: "PROVIDER_ERROR" },
    { ticker: "AAPL", status: "pending", created_at: "2026-07-27T11:00:00Z" },
    { ticker: "MSFT", status: "bogus", created_at: "2026-07-27T11:00:00Z" },
  ]);
  assertEquals(m.get("AAPL")?.status, "pending");
  assertEquals(m.has("MSFT"), false);
  assertEquals(lifecycleLabel(undefined), "No analysis request on record");
  assertEquals(lifecycleLabel(m.get("AAPL")), "Analysis pending");
});

Deno.test("journal side is never coerced", () => {
  assertEquals(normalizeSide("long"), "long");
  assertEquals(normalizeSide("buy"), null);
  assertEquals(normalizeSide(undefined), null);
});

Deno.test("index coverage gaps are detectable", () => {
  assertEquals(missingSymbols(["SPY", "QQQ", "DIA", "IWM"], ["SPY", "QQQ"]), ["DIA", "IWM"]);
});

Deno.test("derived sections fail closed when an input failed", () => {
  assertEquals(derivedSectionStatus(false, 5).status, "unavailable");
  assertEquals(derivedSectionStatus(true, 0).status, "empty");
  assertEquals(derivedSectionStatus(true, 2).status, "available");
});

Deno.test("alerts are ownership-scoped, validated and deduped", () => {
  const out = sanitizeAlerts([
    { ticker: "AAPL", alert_type: "unusual_volume", reason: "RVOL spike", event_time: "2026-07-27T11:00:00Z", dedupe_key: "k1" },
    { ticker: "AAPL", alert_type: "unusual_volume", reason: "dupe", event_time: "2026-07-27T12:00:00Z", dedupe_key: "k1" },
    { ticker: "TSLA", alert_type: "unusual_volume", reason: "not owned", event_time: "2026-07-27T12:00:00Z", dedupe_key: "k2" },
    { ticker: "AAPL", alert_type: "key_level", reason: "banned", event_time: "2026-07-27T12:00:00Z", dedupe_key: "k3" },
  ], new Set(["AAPL"]));
  assertEquals(out.length, 1);
  assertEquals(out[0].dedupe_key, "k1");
});

Deno.test("volume rows without freshness are unusable", () => {
  assertEquals(isUsableVolumeRow({ symbol: "AAPL", volume: 10, updated_at: null }), false);
  assertEquals(isUsableVolumeRow({ symbol: "AAPL", volume: 0, updated_at: "2026-07-27T12:00:00Z" }), false);
  assertEquals(isUsableVolumeRow({ symbol: "AAPL", volume: 10, updated_at: "2026-07-27T12:00:00Z" }), true);
});
