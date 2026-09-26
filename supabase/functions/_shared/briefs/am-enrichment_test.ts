import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAmUserPrompt } from "./prompts.ts";
import {
  AM_AI_PAYLOAD_LIMITS,
  AM_ENRICHMENT_PROMPT_CHAR_BUDGET,
  collectHighlightedSymbols,
  emptyEnrichment,
  isEnrichmentWithinPromptBudget,
  priorCompletedTradingDate,
  resolveCatalystFeedStatus,
  selectCurrentPremarketMovers,
  selectPriorSessionRadarLeaders,
  watchlistMembershipForSymbols,
} from "./am-enrichment.ts";
import { amEvidenceFixture as makeBundle } from "./am-evidence-fixtures.ts";
import { buildAmV2Snapshot, buildMaterialState, selectContinuationCarryovers } from "./am-evidence.ts";

Deno.test("1. prior-session Radar context selects closed-session leaders by volume", () => {
  const rows = selectPriorSessionRadarLeaders([
    { symbol: "aaa", session_volume: 100 },
    { symbol: "bbb", session_volume: 500, primary_scanner_event: "HOD_BREAK", participation_state: "HOT" },
  ], "2026-09-24");
  assertEquals(rows[0]?.symbol, "BBB");
  assertEquals(rows[0]?.context_scope, "prior_session");
  assertEquals(rows[0]?.data_source, "closed_session_snapshot");
  assertEquals(rows.length <= AM_AI_PAYLOAD_LIMITS.radar_prior_leaders, true);
});

Deno.test("2. continuation handoff ingestion preserves prior-session qualification labels", () => {
  const rows = selectContinuationCarryovers([{
    symbol: "TSLA",
    source_session_date: "2026-09-24",
    source_category: "POWER_HOUR_MOMENTUM",
    evidence_labels: ["power_hour_volume"],
    rvol: 1.8,
    session_move_pct: 2.2,
    last_price: 250,
    close_distance_from_hod_pct: 0.5,
    after_hours_extends: true,
  }]);
  assertEquals(rows[0]?.context_scope, "prior_session_qualification");
  assertEquals(rows[0]?.primary_reason, "power_hour_volume");
  assertEquals(rows[0]?.after_hours_extends, true);
});

Deno.test("3. prior vs current session labeling in AM user prompt", () => {
  const b = makeBundle({
    enrichment: {
      priorSessionRadarLeaders: [{
        symbol: "NVDA",
        trading_date: "2026-09-24",
        context_scope: "prior_session",
        data_source: "closed_session_snapshot",
        session_volume: 1e6,
        primary_scanner_event: "VOL",
        promotion_primary_event: null,
        radar_event_lifecycle: null,
        participation_state: null,
        time_adjusted_rvol: null,
        volume_velocity: null,
        volume_acceleration_pct: null,
        last_price: null,
        session_high: null,
      }],
      currentPremarketMovers: [{
        symbol: "AAPL",
        context_scope: "current_premarket",
        price: 190,
        gap_pct: 1.2,
        volume: 50000,
        participation_rvol: 1.1,
        updated_at: "2026-09-25T08:10:00.000Z",
      }],
      catalystFeedStatus: "verified",
    },
  });
  const prompt = buildAmUserPrompt(b);
  assert(prompt.includes("PRIOR-SESSION RADAR LEADERS"));
  assert(prompt.includes("CURRENT PREMARKET"));
  assert(prompt.includes("closed_session_snapshot"));
});

Deno.test("4. current PM enrichment accepts fresh screener rows", () => {
  const now = Date.parse("2026-09-25T12:20:00Z");
  const movers = selectCurrentPremarketMovers([
    { symbol: "aapl", price: 190, change_percent: 0.8, volume: 1000, updated_at: new Date(now - 5 * 60_000).toISOString() },
  ], now);
  assertEquals(movers.length, 1);
  assertEquals(movers[0]?.context_scope, "current_premarket");
});

Deno.test("5. missing PM data yields empty current movers", () => {
  const movers = selectCurrentPremarketMovers([], Date.now());
  assertEquals(movers.length, 0);
});

Deno.test("6-8. catalyst feed status verified / none / unavailable", () => {
  assertEquals(resolveCatalystFeedStatus(false, 2), "verified");
  assertEquals(resolveCatalystFeedStatus(false, 0), "none");
  assertEquals(resolveCatalystFeedStatus(true, 0), "unavailable");
});

Deno.test("9-10. participation context present; missing participation omitted", () => {
  const withPart = selectPriorSessionRadarLeaders([
    { symbol: "x", session_volume: 1, participation_state: "ELEVATED", time_adjusted_rvol: 2.5 },
  ], "2026-09-24");
  assertEquals(withPart[0]?.participation_state, "ELEVATED");
  const without = selectPriorSessionRadarLeaders([{ symbol: "y", session_volume: 1 }], "2026-09-24");
  assertEquals(without[0]?.participation_state, null);
});

Deno.test("11-12. watchlist membership annotation", () => {
  const wl = new Set(["AAPL", "MSFT"]);
  const rows = watchlistMembershipForSymbols(["AAPL", "TSLA", "aapl"], wl);
  assertEquals(rows, [
    { symbol: "AAPL", on_user_watchlist: true },
    { symbol: "TSLA", on_user_watchlist: false },
  ]);
});

Deno.test("13. bounded AI payload limits documented", () => {
  assert(AM_AI_PAYLOAD_LIMITS.radar_prior_leaders <= 8);
  assert(AM_AI_PAYLOAD_LIMITS.current_pm_movers <= 8);
});

Deno.test("14-15. empty Radar and empty continuation degrade gracefully", () => {
  const b = makeBundle({ continuationCarryovers: [], enrichment: emptyEnrichment("none") });
  const prompt = buildAmUserPrompt(b);
  assert(!prompt.includes("PRIOR-SESSION RADAR LEADERS"));
  assert(!prompt.includes("CONTINUATION CARRYOVERS"));
});

Deno.test("16. optional provider failure uses unavailable catalyst status", () => {
  assertEquals(emptyEnrichment("unavailable").catalystFeedStatus, "unavailable");
});

Deno.test("17. scheduler auth assumptions — brief-dispatch uses SYNC_SECRET bearer", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../../migrations/20260828170000_brief_dispatch_am_v2_eval.sql", import.meta.url),
  );
  assert(sql.includes("brief-dispatch"));
  assert(sql.includes("sync_secret"));
  assert(sql.includes("briefType\":\"am\""));
});

Deno.test("18. no duplicate morning generation remains generator-side decision gate", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-daily-brief/index.ts", import.meta.url),
  );
  assert(src.includes("decideAmGeneration"));
  assert(src.includes("return_cached"));
});

Deno.test("19. successful persisted brief includes intelligence_enrichment snapshot section", () => {
  const b = makeBundle({ enrichment: emptyEnrichment("verified") });
  const snap = buildAmV2Snapshot(b, buildMaterialState(b));
  assert(typeof snap.intelligence_enrichment === "object");
});

Deno.test("20. prompt enrichment stays within char budget for typical bundle", () => {
  const prompt = buildAmUserPrompt(makeBundle());
  assert(isEnrichmentWithinPromptBudget(prompt.length));
  assert(prompt.length < AM_ENRICHMENT_PROMPT_CHAR_BUDGET * 3);
});

Deno.test("prior completed trading date skips weekend on Monday", () => {
  assertEquals(priorCompletedTradingDate("2026-09-28", "Mon"), "2026-09-25");
});

Deno.test("collectHighlightedSymbols dedupes tickers", () => {
  const symbols = collectHighlightedSymbols({
    catalysts: [{ symbol: "aapl" }],
    continuation: [{ symbol: "AAPL" }],
    radarPrior: [{ symbol: "msft" }],
    currentPm: [{ symbol: "msft" }],
  });
  assertEquals(symbols.sort(), ["AAPL", "MSFT"]);
});
