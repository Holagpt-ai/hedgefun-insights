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
  normalizeSymbol,
  normalizeTimeOfDay,
  positiveOrNull,
  sortByVolumeDesc,
  unavailableSection,
  validateProviderStatus,
} from "./contract.ts";

const PROVIDER_NOW = "2026-07-27T08:00:00-04:00";
const PROVIDER_NOW_MS = Date.parse(PROVIDER_NOW);
const PREMARKET_BODY = {
  market: "extended-hours",
  earlyHours: true,
  afterHours: false,
  serverTime: PROVIDER_NOW,
  exchanges: { nyse: "extended-hours", nasdaq: "extended-hours", otc: "closed" },
};
const statusOpts = { etDate: "2026-07-27", nowMs: PROVIDER_NOW_MS };

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

Deno.test("a complete agreeing payload confirms the session", () => {
  const v = validateProviderStatus(PREMARKET_BODY, statusOpts);
  assertEquals(v.ok && v.session, "premarket");
  assertEquals(
    validateProviderStatus({
      market: "open",
      serverTime: "2026-07-27T10:00:00-04:00",
      exchanges: { nyse: "open", nasdaq: "open" },
    }, { etDate: "2026-07-27", nowMs: Date.parse("2026-07-27T10:00:00-04:00") }).ok,
    true,
  );
});

Deno.test("a session is never derived from flags alone", () => {
  // No exchanges block at all.
  const v = validateProviderStatus({ market: "extended-hours", earlyHours: true, serverTime: PROVIDER_NOW }, statusOpts);
  assertEquals(v.ok, false);
  assertEquals(v.ok === false && v.reason, "MARKET_STATUS_CONTRADICTORY");
});

Deno.test("market state disagreeing with an exchange fails closed", () => {
  const v = validateProviderStatus(
    { ...PREMARKET_BODY, exchanges: { nyse: "extended-hours", nasdaq: "closed" } },
    statusOpts,
  );
  assertEquals(v.ok === false && v.reason, "MARKET_STATUS_CONTRADICTORY");
  const v2 = validateProviderStatus({ ...PREMARKET_BODY, market: "open" }, statusOpts);
  assertEquals(v2.ok === false && v2.reason, "MARKET_STATUS_CONTRADICTORY");
});

Deno.test("both extended-hours flags set at once is contradictory", () => {
  const v = validateProviderStatus({ ...PREMARKET_BODY, afterHours: true }, statusOpts);
  assertEquals(v.ok === false && v.reason, "MARKET_STATUS_CONTRADICTORY");
});

Deno.test("extended-hours without a session flag is contradictory", () => {
  const v = validateProviderStatus({ ...PREMARKET_BODY, earlyHours: false }, statusOpts);
  assertEquals(v.ok === false && v.reason, "MARKET_STATUS_CONTRADICTORY");
});

Deno.test("a provider clock without an ET offset is unusable", () => {
  const bad = (t: unknown) =>
    validateProviderStatus({ ...PREMARKET_BODY, serverTime: t }, statusOpts);
  assertEquals(bad(undefined).ok === false && bad(undefined).reason, "PROVIDER_TIME_INVALID");
  assertEquals(bad("2026-07-27T12:00:00Z").ok, false);
  assertEquals(bad("2026-07-27T08:00:00+02:00").ok, false);
  assertEquals(bad("garbage-04:00").ok, false);
});

Deno.test("a skewed provider clock is unusable", () => {
  const v = validateProviderStatus(PREMARKET_BODY, {
    etDate: "2026-07-27",
    nowMs: PROVIDER_NOW_MS + 6 * 60_000,
  });
  assertEquals(v.ok === false && v.reason, "PROVIDER_TIME_INVALID");
  // A provider clock in the future is equally unusable.
  assertEquals(
    validateProviderStatus(PREMARKET_BODY, { etDate: "2026-07-27", nowMs: PROVIDER_NOW_MS - 6 * 60_000 }).ok,
    false,
  );
});

Deno.test("a provider clock on the wrong ET date is unusable", () => {
  const v = validateProviderStatus(PREMARKET_BODY, { etDate: "2026-07-28", nowMs: PROVIDER_NOW_MS });
  assertEquals(v.ok === false && v.reason, "PROVIDER_TIME_INVALID");
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
  selectVolumeLeaders,
  validateCalendarRows,
  validateExchangeAgreement,
} from "./contract.ts";

// /marketstatus/upcoming lists only special days; a normal session has no row for today.
// Every exception date must be reported by exactly one NYSE and one NASDAQ row.
const CAL_OK = [
  { date: "2026-07-28", status: "early-close", exchange: "NYSE", open: "2026-07-28T13:30:00Z", close: "2026-07-28T17:00:00Z" },
  { date: "2026-07-28", status: "early-close", exchange: "NASDAQ", open: "2026-07-28T13:30:00Z", close: "2026-07-28T17:00:00Z" },
];
const NOW_OK = PREMARKET_BODY;
const CTX_BASE = { etDate: "2026-07-27", etWeekday: "Mon", nowMs: PROVIDER_NOW_MS };

Deno.test("ET date shift is calendar-accurate across month end", () => {
  assertEquals(etDateShift("2026-08-01", -2), "2026-07-30");
  assertEquals(etDateShift("garbage", -1), "garbage");
});

Deno.test("calendar validation fails closed on partial rows", () => {
  assertEquals(validateCalendarRows(null).ok, false);
  assertEquals(validateCalendarRows([{ date: "2026-07-27", status: "closed" }]).ok, false);
  assertEquals(validateCalendarRows([{ date: "bad", status: "closed", exchange: "NYSE" }]).ok, false);
  assertEquals(validateCalendarRows(CAL_OK).ok, true);
});

Deno.test("an exception calendar row claiming a normal session is unusable", () => {
  const r = validateCalendarRows([{ date: "2026-07-28", status: "open", exchange: "NYSE" }]);
  assertEquals(r.ok, false);
  assertEquals(r.ok === false && r.reason, "CALENDAR_UNAVAILABLE");
});

Deno.test("unsupported calendar status fails closed", () => {
  const r = validateCalendarRows([{ date: "2026-07-28", status: "half-day", exchange: "NYSE" }]);
  assertEquals(r.ok, false);
  assertEquals(r.ok === false && r.reason, "CALENDAR_UNAVAILABLE");
});

Deno.test("non NYSE/NASDAQ exchanges never influence the calendar", () => {
  const r = validateCalendarRows([
    { date: "2026-07-28", status: "closed", exchange: "OTC" },
    { date: "2026-07-28", status: "weird-status", exchange: "CRYPTO" },
  ]);
  assertEquals(r.ok, true);
  assertEquals(r.ok === true && r.rows.length, 0);
});

Deno.test("early-close row without a close timestamp fails closed", () => {
  assertEquals(
    validateCalendarRows([{ date: "2026-07-28", status: "early-close", exchange: "NYSE", close: null }]).ok,
    false,
  );
});

Deno.test("malformed timestamps fail closed", () => {
  assertEquals(
    validateCalendarRows([{ date: "2026-07-28", status: "closed", exchange: "NYSE", open: "not-a-time" }]).ok,
    false,
  );
});

Deno.test("a single-exchange future exception is not sufficient evidence", () => {
  const cal = [{ date: "2026-07-28", status: "closed", exchange: "NYSE", open: null, close: null }];
  const v = validateCalendarRows(cal);
  assertEquals(v.ok, true);
  const agreed = validateExchangeAgreement(v.ok === true ? v.rows : []);
  assertEquals(agreed.ok, false);
  assertEquals(agreed.ok === false && agreed.reason, "CALENDAR_CONTRADICTORY");
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: cal });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_CONTRADICTORY");
});

Deno.test("duplicate rows for one exchange on a date fail closed", () => {
  const cal = [
    ...CAL_OK,
    { date: "2026-07-28", status: "early-close", exchange: "NYSE", open: "2026-07-28T13:30:00Z", close: "2026-07-28T17:00:00Z" },
  ];
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: cal });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_CONTRADICTORY");
});

Deno.test("conflicting future exchange rows fail closed", () => {
  const cal = [
    { date: "2026-07-28", status: "closed", exchange: "NYSE", open: null, close: null },
    { date: "2026-07-28", status: "early-close", exchange: "NASDAQ", open: null, close: "2026-07-28T17:00:00Z" },
  ];
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: cal });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_CONTRADICTORY");
});

Deno.test("conflicting future early-close times fail closed", () => {
  const cal = [
    { date: "2026-07-28", status: "early-close", exchange: "NYSE", open: null, close: "2026-07-28T17:00:00Z" },
    { date: "2026-07-28", status: "early-close", exchange: "NASDAQ", open: null, close: "2026-07-28T18:00:00Z" },
  ];
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: cal });
  assertEquals(r.reason_code, "CALENDAR_CONTRADICTORY");
});

Deno.test("missing calendar never yields a session", () => {
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: null });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_UNAVAILABLE");
  assertEquals(r.source, null);
});

Deno.test("contradictory exchange rows fail closed", () => {
  const cal = [
    { date: "2026-07-27", status: "early-close", exchange: "NYSE", open: null, close: "2026-07-27T17:00:00Z" },
    { date: "2026-07-27", status: "closed", exchange: "NASDAQ", open: null, close: null },
  ];
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: cal });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "CALENDAR_CONTRADICTORY");
});

Deno.test("provider serverTime without ET offset fails closed", () => {
  const r = resolveMarketContext({
    ...CTX_BASE,
    nowBody: { market: "open", serverTime: "not-a-time", exchanges: { nyse: "open", nasdaq: "open" } },
    calendarBody: CAL_OK,
  });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "PROVIDER_TIME_INVALID");
});

Deno.test("a contradictory current status never confirms a session", () => {
  const r = resolveMarketContext({
    ...CTX_BASE,
    nowBody: { ...PREMARKET_BODY, exchanges: { nyse: "extended-hours", nasdaq: "open" } },
    calendarBody: CAL_OK,
  });
  assertEquals(r.status, "unavailable");
  assertEquals(r.reason_code, "MARKET_STATUS_CONTRADICTORY");
  assertEquals(r.source, null);
});

Deno.test("valid evidence resolves premarket without inventing a next session", () => {
  const r = resolveMarketContext({ ...CTX_BASE, nowBody: NOW_OK, calendarBody: CAL_OK });
  assertEquals(r.status, "premarket");
  assertEquals(r.reason_code, null);
  assertEquals(r.source, "polygon_marketstatus");
  assertEquals(r.official_open_at, null);
  // The exception calendar is NOT a schedule of future sessions.
  assertEquals(r.next_known_session_at, null);
});

Deno.test("a weekend is a non-trading day even with a valid payload", () => {
  const r = resolveMarketContext({
    ...CTX_BASE,
    etWeekday: "Sat",
    nowBody: { market: "closed", serverTime: PROVIDER_NOW, exchanges: { nyse: "closed", nasdaq: "closed" } },
    calendarBody: CAL_OK,
  });
  assertEquals(r.status, "non_trading_day");
  assertEquals(r.reason_code, "NON_TRADING_DAY");
});

Deno.test("non-premarket sessions are labeled OUTSIDE_PREMARKET", () => {
  const t = "2026-07-27T10:00:00-04:00";
  const r = resolveMarketContext({
    ...CTX_BASE,
    nowMs: Date.parse(t),
    nowBody: { market: "open", serverTime: t, exchanges: { nyse: "open", nasdaq: "open" } },
    calendarBody: CAL_OK,
  });
  assertEquals(r.status, "regular");
  assertEquals(r.reason_code, "OUTSIDE_PREMARKET");
});

Deno.test("a future exception row is never called the next trading session", () => {
  assertEquals(nextKnownSessionFrom([
    { date: "2026-07-28", status: "early-close", exchange: "NYSE", open: "2026-07-28T13:30:00Z", close: "2026-07-28T17:00:00Z" },
  ], "2026-07-27"), null);
  assertEquals(nextKnownSessionFrom([], "2026-07-27"), null);
});

// ------------------------------------------------- signal contract (complete)

const FULL_SIGNAL = {
  signal_id: "hod_break",
  label: "New session high",
  category: "level",
  kind: "transition",
  direction: "bullish",
  facts: { price: 10.5, hod: 10.4 },
  inputs: ["price", "hod"],
  observed_at: "2026-07-27T12:00:00Z",
  rule_version: "w2b1c.1",
};

Deno.test("a complete authorized signal is accepted and deduped", () => {
  const out = sanitizeMarketSignals(
    [FULL_SIGNAL, { ...FULL_SIGNAL, label: "dupe" }],
    { unavailable: false },
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].signal_id, "hod_break");
  assertEquals(out[0].category, "level");
});

Deno.test("unauthorized ids and empty labels are excluded", () => {
  assertEquals(sanitizeMarketSignals([{ ...FULL_SIGNAL, signal_id: "made_up" }], { unavailable: false }).length, 0);
  assertEquals(sanitizeMarketSignals([{ ...FULL_SIGNAL, label: "   " }], { unavailable: false }).length, 0);
});

Deno.test("signals missing category, kind or rule version are excluded", () => {
  const drop = (patch: Record<string, unknown>) =>
    sanitizeMarketSignals([{ ...FULL_SIGNAL, ...patch }], { unavailable: false }).length;
  assertEquals(drop({ category: undefined }), 0);
  assertEquals(drop({ category: "momentum" }), 0);
  assertEquals(drop({ kind: undefined }), 0);
  assertEquals(drop({ kind: "guess" }), 0);
  assertEquals(drop({ rule_version: "w2b1c.0" }), 0);
  assertEquals(drop({ rule_version: undefined }), 0);
});

Deno.test("signals with malformed facts, inputs or observed time are excluded", () => {
  const drop = (patch: Record<string, unknown>) =>
    sanitizeMarketSignals([{ ...FULL_SIGNAL, ...patch }], { unavailable: false }).length;
  assertEquals(drop({ facts: undefined }), 0);
  assertEquals(drop({ facts: [] }), 0);
  assertEquals(drop({ facts: { nested: { a: 1 } } }), 0);
  assertEquals(drop({ facts: { bad: Number.NaN } }), 0);
  assertEquals(drop({ inputs: undefined }), 0);
  assertEquals(drop({ inputs: "price" }), 0);
  assertEquals(drop({ inputs: [1, 2] }), 0);
  assertEquals(drop({ observed_at: undefined }), 0);
  assertEquals(drop({ observed_at: "nonsense" }), 0);
});

Deno.test("an explicit null direction is authorized, an unknown one is not", () => {
  assertEquals(sanitizeMarketSignals([{ ...FULL_SIGNAL, direction: null }], { unavailable: false })[0].direction, null);
  assertEquals(sanitizeMarketSignals([{ ...FULL_SIGNAL, direction: "sideways" }], { unavailable: false }).length, 0);
  assertEquals(sanitizeMarketSignals([{ ...FULL_SIGNAL, direction: undefined }], { unavailable: false }).length, 0);
});

Deno.test("data unavailable rows expose no signals", () => {
  assertEquals(sanitizeMarketSignals([FULL_SIGNAL], { unavailable: true }).length, 0);
});

Deno.test("unknown direction becomes data_unavailable", () => {
  assertEquals(normalizeDirection("moon"), "data_unavailable");
  assertEquals(normalizeDirection("bearish"), "bearish");
});

// ------------------------------------------------ request lifecycle (schema)

Deno.test("request lifecycle reads the real requested_at column", () => {
  const m = latestRequestByTicker([
    { ticker: "AAPL", status: "failed", requested_at: "2026-07-27T10:00:00Z", error_code: "PROVIDER_ERROR" },
    { ticker: "AAPL", status: "pending", requested_at: "2026-07-27T11:00:00Z" },
    { ticker: "MSFT", status: "bogus", requested_at: "2026-07-27T11:00:00Z" },
  ]);
  assertEquals(m.get("AAPL")?.status, "pending");
  assertEquals(m.get("AAPL")?.requested_at, "2026-07-27T11:00:00Z");
  assertEquals(m.has("MSFT"), false);
  assertEquals(lifecycleLabel(undefined), "No analysis request on record");
  assertEquals(lifecycleLabel(m.get("AAPL")), "Analysis pending");
});

Deno.test("latest request wins regardless of row order", () => {
  const rows = [
    { ticker: "AAPL", status: "pending", requested_at: "2026-07-27T11:00:00Z" },
    { ticker: "AAPL", status: "succeeded", requested_at: "2026-07-27T09:00:00Z" },
  ];
  assertEquals(latestRequestByTicker(rows).get("AAPL")?.status, "pending");
  assertEquals(latestRequestByTicker([...rows].reverse()).get("AAPL")?.status, "pending");
});

Deno.test("a legacy created_at row carries no lifecycle timestamp", () => {
  const m = latestRequestByTicker([{ ticker: "AAPL", status: "pending", created_at: "2026-07-27T11:00:00Z" }]);
  assertEquals(m.get("AAPL")?.requested_at, null);
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

// -------------------------------------------------- volume freshness closure

const VOL_NOW = Date.parse("2026-07-27T13:00:00Z");
const volOpts = { limit: 6, nowMs: VOL_NOW, active: true, staleMinutes: 30 };

Deno.test("an unverifiable row's timestamp never vouches for another row", () => {
  // One positive-volume row has no timestamp; the timestamped row has no volume.
  const v = selectVolumeLeaders<{ volume: number | null; updated_at: string | null; change_percent?: number | null }>(
    [],
    { ...volOpts, positiveVolumeCandidates: 2 },
  );
  assertEquals(v.status, "unavailable");
  assertEquals(v.reason_code, "SOURCE_UNVERIFIABLE");
});

Deno.test("no positive-volume candidates at all is empty, not unavailable", () => {
  const v = selectVolumeLeaders([], { ...volOpts, positiveVolumeCandidates: 0 });
  assertEquals(v.status, "empty");
  assertEquals(v.reason_code, "NO_QUALIFYING_DATA");
});

Deno.test("mixed verifiable and unverifiable rows display only verifiable ones", () => {
  const v = selectVolumeLeaders(
    [
      { symbol: "A", volume: 100, updated_at: "2026-07-27T12:55:00Z", change_percent: 1 },
      { symbol: "B", volume: 900, updated_at: "2026-07-27T12:50:00Z", change_percent: 1 },
    ],
    { ...volOpts, positiveVolumeCandidates: 3 },
  );
  assertEquals(v.status, "available");
  assertEquals(v.rows.map((r) => (r as { symbol: string }).symbol), ["B", "A"]);
});

Deno.test("any displayed stale row makes the whole section stale", () => {
  const v = selectVolumeLeaders(
    [
      { symbol: "A", volume: 900, updated_at: "2026-07-27T12:55:00Z" },
      { symbol: "B", volume: 800, updated_at: "2026-07-27T11:00:00Z" },
    ],
    { ...volOpts, positiveVolumeCandidates: 2 },
  );
  assertEquals(v.status, "stale");
  assertEquals(v.reason_code, "SOURCE_STALE");
  // newest displayed timestamp is disclosed as "last available"
  assertEquals(v.as_of, "2026-07-27T12:55:00Z");
});

Deno.test("freshness is not applied outside an active session", () => {
  const v = selectVolumeLeaders(
    [{ symbol: "A", volume: 900, updated_at: "2026-07-26T12:00:00Z" }],
    { ...volOpts, active: false, positiveVolumeCandidates: 1 },
  );
  assertEquals(v.status, "available");
});

