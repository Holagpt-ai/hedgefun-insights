import { describe, expect, it } from "vitest";
import { SCREENER_TABS } from "@/config/screener-tabs.config";
import {
  expectedVolumeRatio,
  formatDayRange,
  isGenerationStale,
  loadVerifiedScreenerGeneration,
  MANAGED_TAB_IDS,
  msUntilStaleTransition,
  SCREENER_STALE_AFTER_MS,
  validateGeneration,
  viewForActiveTab,
  type GenerationFetchResult,
  type ScreenerFeedState,
  type ScreenerResultRow,
  type ValidatedGeneration,
} from "@/lib/screeners/contract";

const NOW = Date.parse("2026-07-28T16:00:00.000Z");
const SYNCED = "2026-07-28T15:50:00.000Z";
const PROVIDER = "2026-07-28T15:45:00.000Z";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function emptyCounts() {
  return {
    day_trade_radar: 0,
    gappers: 0,
    volume_spikes: 0,
    gainers_losers: 0,
    unusual_volume: 0,
    new_highs_lows: 0,
  };
}

function state(overrides: Partial<ScreenerFeedState> = {}): ScreenerFeedState {
  return {
    state_key: "current",
    sync_run_id: RUN_ID,
    status: "available",
    synced_at: SYNCED,
    provider_as_of_min: PROVIDER,
    provider_as_of_max: PROVIDER,
    rows_inserted: 1,
    tab_counts: { ...emptyCounts(), day_trade_radar: 1 },
    updated_at: SYNCED,
    ...overrides,
  };
}

function row(overrides: Partial<ScreenerResultRow> = {}): ScreenerResultRow {
  const volume = overrides.volume ?? 10_000;
  const prior = overrides.prior_session_volume === undefined ? 2_000 : overrides.prior_session_volume;
  const ratio =
    overrides.volume_ratio_prior_session === undefined
      ? prior === null
        ? null
        : expectedVolumeRatio(volume as number, prior)
      : overrides.volume_ratio_prior_session;
  return {
    tab_id: "day_trade_radar",
    symbol: "AAPL",
    company_name: "Apple",
    price: 10,
    change_percent: 12,
    volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    market_cap: null,
    prior_session_volume: prior,
    volume_ratio_prior_session: ratio,
    day_high: 11,
    day_low: 9,
    provider_as_of: PROVIDER,
    sync_run_id: RUN_ID,
    updated_at: SYNCED,
    ...overrides,
  };
}

function validAvailable(): { state: ScreenerFeedState; rows: ScreenerResultRow[] } {
  const r = row();
  return { state: state(), rows: [r] };
}

describe("screeners verified generation contract", () => {
  it("1. accepts a valid available generation", () => {
    const { state: s, rows } = validAvailable();
    const out = validateGeneration([s], rows, NOW);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.generation.status).toBe("available");
  });

  it("2. valid global available generation with zero rows for one active tab returns empty", () => {
    const { state: s, rows } = validAvailable();
    const gen = validateGeneration([s], rows, NOW);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    const view = viewForActiveTab(gen.generation, "gappers", NOW, 1);
    expect(view.status).toBe("empty");
    expect(view.rows).toHaveLength(0);
  });

  it("3. accepts a valid global empty generation", () => {
    const s = state({
      status: "empty",
      rows_inserted: 0,
      tab_counts: emptyCounts(),
      provider_as_of_min: null,
      provider_as_of_max: null,
    });
    const out = validateGeneration([s], [], NOW);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.generation.status).toBe("empty");
  });

  it("4. stale classification uses synced_at, not provider_as_of", () => {
    const syncedAt = new Date(NOW - SCREENER_STALE_AFTER_MS - 1).toISOString();
    const oldProvider = new Date(NOW - 7 * 86_400_000).toISOString();
    expect(isGenerationStale(syncedAt, NOW)).toBe(true);
    expect(isGenerationStale(SYNCED, NOW)).toBe(false);

    const r = row({
      provider_as_of: oldProvider,
      updated_at: syncedAt,
    });
    const s = state({
      synced_at: syncedAt,
      updated_at: syncedAt,
      provider_as_of_min: oldProvider,
      provider_as_of_max: oldProvider,
    });
    const out = validateGeneration([s], [r], NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const view = viewForActiveTab(out.generation, "day_trade_radar", NOW, 1);
    expect(view.status).toBe("stale");
    expect(view.rows).toHaveLength(1);
  });

  it("4b. msUntilStaleTransition matches the strict > 20-minute rule", () => {
    const freshSynced = new Date(NOW - 60_000).toISOString();
    expect(msUntilStaleTransition(freshSynced, NOW)).toBe(
      SCREENER_STALE_AFTER_MS - 60_000 + 1,
    );

    const exactlyThreshold = new Date(NOW - SCREENER_STALE_AFTER_MS).toISOString();
    expect(msUntilStaleTransition(exactlyThreshold, NOW)).toBe(1);

    const alreadyStale = new Date(NOW - SCREENER_STALE_AFTER_MS - 1).toISOString();
    expect(msUntilStaleTransition(alreadyStale, NOW)).toBe(0);

    expect(msUntilStaleTransition("not-a-timestamp", NOW)).toBeNull();
  });

  it("5. old provider timestamp alone does not invalidate a fresh pipeline generation", () => {
    const oldProvider = "2026-07-20T15:00:00.000Z";
    const r = row({ provider_as_of: oldProvider });
    const s = state({
      provider_as_of_min: oldProvider,
      provider_as_of_max: oldProvider,
    });
    const out = validateGeneration([s], [r], NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const view = viewForActiveTab(out.generation, "day_trade_radar", NOW, 1);
    expect(view.status).toBe("available");
  });

  it("6. first-attempt generation mismatch retries and succeeds", async () => {
    let calls = 0;
    const good = validAvailable();
    const badState = state({ sync_run_id: "22222222-2222-4222-8222-222222222222" });
    const view = await loadVerifiedScreenerGeneration(
      async (): Promise<GenerationFetchResult> => {
        calls += 1;
        if (calls === 1) {
          return {
            stateRows: [badState],
            resultRows: good.rows,
            stateError: null,
            resultError: null,
          };
        }
        return {
          stateRows: [good.state],
          resultRows: good.rows,
          stateError: null,
          resultError: null,
        };
      },
      { nowMs: NOW, activeTabId: "day_trade_radar" },
    );
    expect(calls).toBe(2);
    expect(view.status).toBe("available");
    expect(view.rows).toHaveLength(1);
    expect(view.attempts).toBe(2);
  });

  it("7. persistent mismatch retries exactly once and returns unavailable", async () => {
    let calls = 0;
    const good = validAvailable();
    const badState = state({ sync_run_id: "22222222-2222-4222-8222-222222222222" });
    const view = await loadVerifiedScreenerGeneration(
      async () => {
        calls += 1;
        return {
          stateRows: [badState],
          resultRows: good.rows,
          stateError: null,
          resultError: null,
        };
      },
      { nowMs: NOW, activeTabId: "day_trade_radar" },
    );
    expect(calls).toBe(2);
    expect(view.status).toBe("unavailable");
    expect(view.rows).toHaveLength(0);
    expect(view.attempts).toBe(2);
  });

  it("8. state query failure returns unavailable", async () => {
    const view = await loadVerifiedScreenerGeneration(
      async () => ({
        stateRows: null,
        resultRows: [],
        stateError: { message: "boom" },
        resultError: null,
      }),
      { nowMs: NOW, activeTabId: "day_trade_radar" },
    );
    expect(view.status).toBe("unavailable");
    expect(view.attempts).toBe(1);
  });

  it("9. results query failure returns unavailable", async () => {
    const view = await loadVerifiedScreenerGeneration(
      async () => ({
        stateRows: [state()],
        resultRows: null,
        stateError: null,
        resultError: { message: "boom" },
      }),
      { nowMs: NOW, activeTabId: "day_trade_radar" },
    );
    expect(view.status).toBe("unavailable");
    expect(view.attempts).toBe(1);
  });

  it("10. missing or duplicate state row fails", () => {
    const { rows } = validAvailable();
    expect(validateGeneration([], rows, NOW).ok).toBe(false);
    expect(validateGeneration([state(), state()], rows, NOW).ok).toBe(false);
  });

  it("11. invalid state status fails", () => {
    const { rows } = validAvailable();
    expect(validateGeneration([state({ status: "syncing" })], rows, NOW).ok).toBe(false);
  });

  it("12. rows_inserted and tab-count mismatch fails", () => {
    const { rows } = validAvailable();
    expect(
      validateGeneration(
        [state({ rows_inserted: 2, tab_counts: { ...emptyCounts(), day_trade_radar: 1 } })],
        rows,
        NOW,
      ).ok,
    ).toBe(false);
  });

  it("13. result sync_run_id mismatch fails", () => {
    const { state: s } = validAvailable();
    const r = row({ sync_run_id: "33333333-3333-4333-8333-333333333333" });
    expect(validateGeneration([s], [r], NOW).ok).toBe(false);
  });

  it("14. duplicate tab/symbol fails", () => {
    const r1 = row({ symbol: "AAPL", volume: 10_000 });
    const r2 = row({ symbol: "AAPL", volume: 9_000 });
    const s = state({
      rows_inserted: 2,
      tab_counts: { ...emptyCounts(), day_trade_radar: 2 },
    });
    expect(validateGeneration([s], [r1, r2], NOW).ok).toBe(false);
  });

  it("15. invalid symbol fails", () => {
    const { state: s } = validAvailable();
    expect(validateGeneration([s], [row({ symbol: "aapl" })], NOW).ok).toBe(false);
    expect(validateGeneration([s], [row({ symbol: "1ABC" })], NOW).ok).toBe(false);
  });

  it("16. zero, negative, NaN, or infinite volume fails", () => {
    const { state: s } = validAvailable();
    for (const volume of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateGeneration([s], [row({ volume })], NOW).ok).toBe(false);
    }
  });

  it("17. incorrect volume ordering fails", () => {
    const r1 = row({ symbol: "AAA", volume: 5_000 });
    const r2 = row({ symbol: "BBB", volume: 9_000 });
    const s = state({
      rows_inserted: 2,
      tab_counts: { ...emptyCounts(), day_trade_radar: 2 },
    });
    expect(validateGeneration([s], [r1, r2], NOW).ok).toBe(false);
  });

  it("18. equal-volume symbols not in ascending order fail", () => {
    const r1 = row({ symbol: "ZZZ", volume: 9_000 });
    const r2 = row({ symbol: "AAA", volume: 9_000 });
    const s = state({
      rows_inserted: 2,
      tab_counts: { ...emptyCounts(), day_trade_radar: 2 },
    });
    expect(validateGeneration([s], [r1, r2], NOW).ok).toBe(false);
  });

  it("19. non-null legacy rvol or avg_volume fails", () => {
    const { state: s } = validAvailable();
    expect(validateGeneration([s], [row({ rvol: 3 })], NOW).ok).toBe(false);
    expect(validateGeneration([s], [row({ avg_volume: 1000 })], NOW).ok).toBe(false);
  });

  it("20. non-null float, market cap, or 52-week fields fail", () => {
    const { state: s } = validAvailable();
    expect(validateGeneration([s], [row({ float_shares: 1 })], NOW).ok).toBe(false);
    expect(validateGeneration([s], [row({ market_cap: 1 })], NOW).ok).toBe(false);
    expect(validateGeneration([s], [row({ high_52w: 1 })], NOW).ok).toBe(false);
    expect(validateGeneration([s], [row({ low_52w: 1 })], NOW).ok).toBe(false);
  });

  it("21. ratio tabs require prior-session metrics", () => {
    const { state: s } = validAvailable();
    expect(
      validateGeneration(
        [s],
        [row({ prior_session_volume: null, volume_ratio_prior_session: null })],
        NOW,
      ).ok,
    ).toBe(false);
  });

  it("22. rounded ratio inconsistent with volume/prior volume fails", () => {
    const { state: s } = validAvailable();
    expect(
      validateGeneration(
        [s],
        [row({ volume: 10_000, prior_session_volume: 2_000, volume_ratio_prior_session: 9.9 })],
        NOW,
      ).ok,
    ).toBe(false);
  });

  it("23. valid and unavailable day-range combinations", () => {
    const { state: s } = validAvailable();
    expect(validateGeneration([s], [row({ day_high: null, day_low: null })], NOW).ok).toBe(true);
    expect(validateGeneration([s], [row({ day_high: 12, day_low: 10 })], NOW).ok).toBe(true);
    expect(validateGeneration([s], [row({ day_high: 12, day_low: null })], NOW).ok).toBe(false);
    expect(formatDayRange(null, null)).toBe("Range unavailable");
    expect(formatDayRange(9, 11)).toBe("$9.00–$11.00");
  });

  it("24. invalid inverted day range fails", () => {
    const { state: s } = validAvailable();
    expect(validateGeneration([s], [row({ day_high: 9, day_low: 11 })], NOW).ok).toBe(false);
  });

  it("25. provider min/max mismatch fails", () => {
    const { rows } = validAvailable();
    expect(
      validateGeneration(
        [state({ provider_as_of_min: "2026-07-28T10:00:00.000Z", provider_as_of_max: PROVIDER })],
        rows,
        NOW,
      ).ok,
    ).toBe(false);
  });

  it("26. New Highs/Lows rows fail as unimplemented", () => {
    const r = row({
      tab_id: "new_highs_lows",
      prior_session_volume: null,
      volume_ratio_prior_session: null,
    });
    const s = state({
      tab_counts: { ...emptyCounts(), new_highs_lows: 1 },
    });
    expect(validateGeneration([s], [r], NOW).ok).toBe(false);

    const emptyGen: ValidatedGeneration = {
      status: "empty",
      state: state({
        status: "empty",
        rows_inserted: 0,
        tab_counts: emptyCounts(),
        provider_as_of_min: null,
        provider_as_of_max: null,
      }),
      rows: [],
      synced_at: SYNCED,
      provider_as_of_max: null,
      provider_as_of_min: null,
    };
    expect(viewForActiveTab(emptyGen, "new_highs_lows", NOW, 1).status).toBe("unimplemented");
  });

  it("27. config contains no sample rows", () => {
    for (const tab of SCREENER_TABS) {
      expect(Object.prototype.hasOwnProperty.call(tab, "rows")).toBe(false);
    }
  });

  it("28. config contains no RVOL, average-volume, float, market-cap, SAMPLE, or Preview claims", () => {
    const blob = JSON.stringify(SCREENER_TABS);
    expect(blob).not.toMatch(/RVOL|rvol|Avg Volume|avg_volume|Float|market_cap|Market Cap|SAMPLE|Preview/i);
  });

  it("29. all existing freeRowLimit values remain unchanged", () => {
    expect(SCREENER_TABS.map((t) => [t.id, t.freeRowLimit])).toEqual([
      ["day_trade_radar", 2],
      ["gappers", 2],
      ["volume_spikes", 2],
      ["gainers_losers", 2],
      ["new_highs_lows", 2],
      ["unusual_volume", 2],
    ]);
  });

  it("30. catalyst data is never part of row ranking or generation validation", () => {
    const { state: s, rows } = validAvailable();
    const out = validateGeneration([s], rows, NOW);
    expect(out.ok).toBe(true);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/catalyst/i);
    expect(MANAGED_TAB_IDS).not.toContain("catalyst");
  });
});
