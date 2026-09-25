import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import {
  buildDisplayFieldLookup,
  enrichDisplayFields,
  enrichDisplayFieldsForRows,
} from "@/lib/screeners/screener-display-enrichment";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SYNCED = "2026-09-14T13:12:30.000Z";

function sentinel(
  symbol: string,
  volume: number,
  overrides: Partial<ScreenerResultRow> = {},
): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 0.68,
    change_percent: null,
    volume,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 0.72,
    day_low: 0.65,
    provider_as_of: SYNCED,
    sync_run_id: GEN,
    updated_at: SYNCED,
    ...overrides,
  };
}

function donor(
  symbol: string,
  tabId: string,
  sentinelVolume: number,
  overrides: Partial<ScreenerResultRow> = {},
): ScreenerResultRow {
  return {
    ...sentinel(symbol, sentinelVolume),
    tab_id: tabId,
    change_percent: 18.4,
    prior_session_volume: 1_000_000,
    volume_ratio_prior_session: sentinelVolume / 1_000_000,
    company_name: "Hain Celestial",
    ...overrides,
  };
}

describe("screener display-field enrichment", () => {
  it("fills Move from verified screener_results when Sentinel leaves change_percent null", () => {
    const row = sentinel("HAIN", 16_500_000);
    const lookup = buildDisplayFieldLookup([donor("HAIN", "volume_spikes", 16_500_000)], null);
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBe(18.4);
    expect(enriched.price).toBe(0.68);
    expect(enriched.volume).toBe(16_500_000);
  });

  it("does not overwrite existing Sentinel display fields", () => {
    const row = sentinel("AAA", 1_000_000, { change_percent: 5.1 });
    const lookup = buildDisplayFieldLookup(
      [donor("AAA", "day_trade_radar", 1_000_000, { change_percent: 20 })],
      null,
    );
    expect(enrichDisplayFields(row, lookup).change_percent).toBe(5.1);
  });

  it("fills Vol/Prior only when prior/ratio pair is consistent with Sentinel volume", () => {
    const row = sentinel("SOXL", 12_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("SOXL", "gainers_losers", 12_000_000, {
          prior_session_volume: 2_000_000,
          volume_ratio_prior_session: 6,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.prior_session_volume).toBe(2_000_000);
    expect(enriched.volume_ratio_prior_session).toBe(6);
  });

  it("rejects inconsistent prior/ratio pairs instead of fabricating Vol/Prior", () => {
    const row = sentinel("BBB", 10_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("BBB", "volume_spikes", 10_000_000, {
          prior_session_volume: 1_000_000,
          volume_ratio_prior_session: 99,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.prior_session_volume).toBeNull();
    expect(enriched.volume_ratio_prior_session).toBeNull();
  });

  it("never backfills legacy rvol", () => {
    const row = sentinel("CCC", 5_000_000);
    const donorRow = donor("CCC", "day_trade_radar", 5_000_000, {
      rvol: 4.2,
    } as Partial<ScreenerResultRow>);
    const lookup = buildDisplayFieldLookup([donorRow], null);
    expect(enrichDisplayFields(row, lookup).rvol).toBeNull();
  });

  it("prefers donors from the active tab when scores tie", () => {
    const row = sentinel("DDD", 8_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("DDD", "gainers_losers", 8_000_000, { change_percent: 11 }),
        donor("DDD", "volume_spikes", 8_000_000, { change_percent: 22 }),
      ],
      null,
      "volume_spikes",
    );
    expect(enrichDisplayFields(row, lookup).change_percent).toBe(22);
  });

  it("searches all tabs so symbols outside day_trade_radar still enrich", () => {
    const rows = enrichDisplayFieldsForRows(
      [sentinel("HAIN", 16_500_000)],
      [donor("HAIN", "volume_spikes", 16_500_000)],
      null,
      { preferredTabId: "day_trade_radar" },
    );
    expect(rows[0].change_percent).toBe(18.4);
    expect(rows[0].volume_ratio_prior_session).toBe(16.5);
  });

  it("uses radar_v22_board donors when screener_results lack the symbol", () => {
    const row = sentinel("EEE", 3_000_000);
    const lookup = buildDisplayFieldLookup(
      [],
      [
        {
          symbol: "EEE",
          price: 0.68,
          volume: 3_000_000,
          change_percent: 9.5,
          prior_session_volume: 500_000,
          volume_ratio_prior_session: 6,
          provider_as_of: SYNCED,
          sync_run_id: GEN,
          updated_at: SYNCED,
        },
      ],
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBe(9.5);
    expect(enriched.volume_ratio_prior_session).toBe(6);
  });

  it("gap_percent copies only when allowGap is true", () => {
    const row = sentinel("FGP", 1_000_000);
    const lookup = buildDisplayFieldLookup(
      [donor("FGP", "gappers", 1_000_000, { gap_percent: 7.2 })],
      null,
    );
    expect(enrichDisplayFields(row, lookup).gap_percent).toBeNull();
    expect(enrichDisplayFields(row, lookup, { allowGap: true }).gap_percent).toBe(7.2);
  });

  it("rejects donors from a previous Eastern trading day", () => {
    const row = sentinel("PREV", 5_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("PREV", "volume_spikes", 5_000_000, {
          provider_as_of: "2026-09-13T13:12:30.000Z",
          updated_at: "2026-09-13T13:12:30.000Z",
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBeNull();
    expect(enriched.prior_session_volume).toBeNull();
    expect(enriched.volume_ratio_prior_session).toBeNull();
  });

  it("rejects same-day donors whose provider timestamp is more than 20 minutes from Sentinel", () => {
    const row = sentinel("STALE", 4_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("STALE", "volume_spikes", 4_000_000, {
          provider_as_of: "2026-09-14T12:50:00.000Z",
          updated_at: "2026-09-14T12:50:00.000Z",
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBeNull();
    expect(enriched.prior_session_volume).toBeNull();
  });

  it("rejects donors whose normalized symbol does not match Sentinel", () => {
    const row = sentinel("SYM", 2_000_000);
    const lookup = new Map([
      [
        "SYM",
        {
          symbol: "SYMX",
          price: 0.68,
          volume: 2_000_000,
          change_percent: 12,
          prior_session_volume: 400_000,
          volume_ratio_prior_session: 5,
          provider_as_of: SYNCED,
        },
      ],
    ]);
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBeNull();
    expect(enriched.prior_session_volume).toBeNull();
  });

  it("recomputes MOVE from the recovered previous close when last price has drifted", () => {
    const row = sentinel("PRICE", 6_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("PRICE", "volume_spikes", 6_000_000, {
          price: 0.75,
          change_percent: 14.2,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    const previousClose = 0.75 / (1 + 14.2 / 100);
    expect(enriched.change_percent).toBeCloseTo(((0.68 - previousClose) / previousClose) * 100, 8);
    expect(enriched.prior_session_volume).toBe(1_000_000);
  });

  it("leaves MOVE blank when donor and last price imply a split-scale jump", () => {
    const row = sentinel("SPLIT", 6_000_000, { price: 6.8 });
    const lookup = buildDisplayFieldLookup(
      [
        donor("SPLIT", "volume_spikes", 6_000_000, {
          price: 0.68,
          change_percent: 0,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBeNull();
    expect(enriched.prior_session_volume).toBe(1_000_000);
  });

  it("maps verified prior volume when session volume and last price differ from the donor", () => {
    const row = sentinel("AIFF", 638_216, { price: 1.93 });
    const lookup = buildDisplayFieldLookup(
      [
        donor("AIFF", "volume_spikes", 142_034_879, {
          price: 2.01,
          change_percent: 68.90756302521007,
          prior_session_volume: 225_295,
          volume_ratio_prior_session: 630.4,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    const previousClose = 2.01 / (1 + 68.90756302521007 / 100);
    expect(enriched.prior_session_volume).toBe(225_295);
    expect(enriched.volume_ratio_prior_session).toBe(2.8);
    expect(enriched.change_percent).toBeCloseTo(((1.93 - previousClose) / previousClose) * 100, 6);
  });

  it("enriches MOVE and recomputes Vol/Prior when prices align but volumes differ", () => {
    const row = sentinel("VOL", 7_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("VOL", "volume_spikes", 6_999_999, {
          change_percent: 11.1,
          prior_session_volume: 1_000_000,
          volume_ratio_prior_session: 7,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.change_percent).toBe(11.1);
    expect(enriched.prior_session_volume).toBe(1_000_000);
    expect(enriched.volume_ratio_prior_session).toBe(7);
  });

  it("rejects Vol/Prior when donor prior/ratio pair is inconsistent", () => {
    const row = sentinel("BADPAIR", 7_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("BADPAIR", "volume_spikes", 7_000_000, {
          prior_session_volume: 1_000_000,
          volume_ratio_prior_session: 99,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.prior_session_volume).toBeNull();
    expect(enriched.volume_ratio_prior_session).toBeNull();
  });

  it("recomputes RVOL 20D from Sentinel volume and donor avg_volume_20d", () => {
    const row = sentinel("RVOL", 10_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("RVOL", "volume_spikes", 1_000_000, {
          avg_volume_20d: 2_000_000,
          rvol_20d: 0.5,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.avg_volume_20d).toBe(2_000_000);
    expect(enriched.rvol_20d).toBe(5);
  });

  it("uses Sentinel volume for RVOL even when donor volume differs", () => {
    const row = sentinel("SENT", 8_000_000);
    const lookup = buildDisplayFieldLookup(
      [
        donor("SENT", "unusual_volume", 3_000_000, {
          avg_volume_20d: 2_000_000,
        }),
      ],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.rvol_20d).toBe(4);
  });

  it("does not enrich RVOL when donor avg_volume_20d is missing", () => {
    const row = sentinel("NOAVG", 5_000_000);
    const lookup = buildDisplayFieldLookup(
      [donor("NOAVG", "gainers_losers", 5_000_000)],
      null,
    );
    const enriched = enrichDisplayFields(row, lookup);
    expect(enriched.avg_volume_20d).toBeNull();
    expect(enriched.rvol_20d).toBeNull();
  });
});
