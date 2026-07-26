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
