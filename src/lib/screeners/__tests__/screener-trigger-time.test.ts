import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCREENER_TAB_ID, SCREENER_TABS } from "@/config/screener-tabs.config";
import {
  isUsableForDisplay,
  isUsableForFiltering,
  isUsableForScoring,
} from "@/lib/screeners/data-quality";
import {
  compareCandidatesVolumeFirst,
  mapCandidateToScreenerRow,
  type RadarV2CandidateRow,
} from "@/lib/screeners/radar-v2-adapter";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";
import {
  buildTriggerEventId,
  emptyTriggerState,
  toCanonicalUtcTimestamp,
  updateTriggerState,
} from "@/lib/screeners/trigger-time";
import {
  TRIGGER_TIME_DISPLAY_TIMEZONE,
  evaluateScreenerTriggerTime,
  formatTriggerTimeDisplay,
  inspectScreenerTriggerQuality,
} from "@/lib/screeners/screener-trigger-time";

const SESSION = "2026-09-21";
const DISCOVERY_AT = "2026-09-21T13:42:00.000Z";
const LATER_DISCOVERY_AT = "2026-09-21T14:17:00.000Z";
const EARLIER_DISCOVERY_AT = "2026-09-21T13:08:00.000Z";
const HOD_BREAK_AT = "2026-09-21T19:08:00.000Z";

function candidate(overrides: Partial<RadarV2CandidateRow> = {}): RadarV2CandidateRow {
  return {
    symbol: "AAA",
    generation_id: "11111111-1111-4111-8111-111111111111",
    trading_date: SESSION,
    session_kind: "market",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 10.4,
    move_15s_pct: 1.2,
    move_60s_pct: 3.4,
    volume_5s: 20_000,
    volume_15s: 40_000,
    volume_60s: 120_000,
    session_volume: 2_500_000,
    dollar_volume_60s: 1_200_000,
    acceleration_5m: 0.5,
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: null,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: null,
    session_high: 10.5,
    session_low: 9,
    distance_from_hod_pct: 0.9,
    session_vwap: 10,
    vwap_side: "above",
    freshness_class: "fresh",
    provider_as_of: "2026-09-21T19:30:00.000Z",
    updated_at: "2026-09-21T19:31:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<RadarV2CandidateRow> = {}) {
  return mapCandidateToScreenerRow(candidate(overrides), "day_trade_radar");
}

describe("Screener Trigger Time adapter", () => {
  it("1. authentic discovery timestamp maps to DISCOVERY_TRIGGER", () => {
    const view = evaluateScreenerTriggerTime(row({ promoted_at: DISCOVERY_AT }));
    expect(view.primary?.triggerType).toBe("DISCOVERY_TRIGGER");
    expect(view.primary?.triggeredAt).toBe(DISCOVERY_AT);
    expect(view.primary?.source).toBe("radar_v22_candidates.promoted_at");
    expect(view.display).toBe("09:42:00");
    expect(view.state.events).toHaveLength(1);
  });

  it("2. earliest valid trigger wins", () => {
    const first = updateTriggerState(emptyTriggerState(), {
      symbol: "AAA",
      sessionDate: SESSION,
      observedAt: LATER_DISCOVERY_AT,
      discoveryQualified: "TRUE",
    });
    const earlier = updateTriggerState(first.state, {
      symbol: "AAA",
      sessionDate: SESSION,
      observedAt: DISCOVERY_AT,
      discoveryQualified: "TRUE",
    });
    expect(earlier.state.events).toHaveLength(1);
    expect(earlier.state.events[0]?.triggeredAt).toBe(DISCOVERY_AT);
  });

  it("3. later duplicate does not overwrite earlier trigger", () => {
    const first = updateTriggerState(emptyTriggerState(), {
      symbol: "AAA",
      sessionDate: SESSION,
      observedAt: DISCOVERY_AT,
      discoveryQualified: "TRUE",
    });
    const later = updateTriggerState(first.state, {
      symbol: "AAA",
      sessionDate: SESSION,
      observedAt: LATER_DISCOVERY_AT,
      discoveryQualified: "TRUE",
    });
    expect(later.added).toEqual([]);
    expect(later.state.events[0]?.triggeredAt).toBe(DISCOVERY_AT);
    const view = evaluateScreenerTriggerTime(
      row({
        promoted_at: DISCOVERY_AT,
        provider_as_of: LATER_DISCOVERY_AT,
        updated_at: "2026-09-21T19:40:00.000Z",
      }),
    );
    expect(view.primary?.triggeredAt).toBe(DISCOVERY_AT);
  });

  it("4. earlier out-of-order observation backdates correctly", () => {
    const first = updateTriggerState(emptyTriggerState(), {
      symbol: "AAA",
      sessionDate: SESSION,
      observedAt: DISCOVERY_AT,
      discoveryQualified: "TRUE",
    });
    const earlier = updateTriggerState(first.state, {
      symbol: "AAA",
      sessionDate: SESSION,
      observedAt: EARLIER_DISCOVERY_AT,
      discoveryQualified: "TRUE",
    });
    expect(earlier.backdated).toHaveLength(1);
    expect(earlier.state.events[0]?.triggeredAt).toBe(EARLIER_DISCOVERY_AT);
    expect(evaluateScreenerTriggerTime(row({ promoted_at: EARLIER_DISCOVERY_AT })).primary?.triggeredAt).toBe(
      EARLIER_DISCOVERY_AT,
    );
  });

  it("5. trigger identity remains deterministic", () => {
    const view = evaluateScreenerTriggerTime(row({ promoted_at: DISCOVERY_AT }));
    const again = evaluateScreenerTriggerTime(row({ promoted_at: DISCOVERY_AT }));
    expect(view.primary && buildTriggerEventId(view.primary)).toBe(
      "AAA|2026-09-21|DISCOVERY_TRIGGER|DISCOVERY",
    );
    expect(view).toEqual(again);
  });

  it("6. invalid timestamp is rejected as INVALID", () => {
    const quality = inspectScreenerTriggerQuality(row({ promoted_at: "not-a-timestamp" }));
    expect(quality.discovery.qualityState).toBe("INVALID");
    expect(isUsableForDisplay(quality.discovery)).toBe(false);
    const view = evaluateScreenerTriggerTime(row({ promoted_at: "not-a-timestamp" }));
    expect(view.primary).toBeNull();
    expect(view.display).toBe("—");
  });

  it("7. missing timestamp is UNAVAILABLE", () => {
    const quality = inspectScreenerTriggerQuality(row());
    expect(quality.discovery.qualityState).toBe("UNAVAILABLE");
    expect(quality.hodBreak.qualityState).toBe("UNAVAILABLE");
    expect(isUsableForDisplay(quality.discovery)).toBe(false);
    expect(evaluateScreenerTriggerTime(row()).display).toBe("—");
  });

  it("8. current volume alone does not fabricate a volume trigger", () => {
    const view = evaluateScreenerTriggerTime(row({ session_volume: 5_000_000, promoted_at: null }));
    expect(view.state.events.some((event) => event.triggerType === "VOLUME_TRIGGER")).toBe(false);
    expect(view.primary).toBeNull();
    expect(view.display).toBe("—");
  });

  it("9. current HOD state does not fabricate an HOD trigger", () => {
    const view = evaluateScreenerTriggerTime(
      row({
        last_price: 10.49,
        session_high: 10.5,
        distance_from_hod_pct: 0.1,
        last_hod_break_at: null,
        promoted_at: null,
      }),
    );
    expect(view.state.events.some((event) => event.triggerType === "HOD_BREAK_TRIGGER")).toBe(false);
    expect(view.display).toBe("—");
  });

  it("10. catalyst presence alone does not fabricate a catalyst trigger", () => {
    const view = evaluateScreenerTriggerTime({
      ...row({ promoted_at: null, last_hod_break_at: null }),
      catalyst_news: "FDA approval",
    } as ReturnType<typeof row>);
    expect(view.state.events.some((event) => event.triggerType === "CATALYST_TRIGGER")).toBe(false);
    expect(view.display).toBe("—");
  });

  it("11. internal timestamps stay canonical UTC", () => {
    const view = evaluateScreenerTriggerTime(row({ promoted_at: "2026-09-21T13:42:00Z" }));
    expect(view.primary?.triggeredAt).toBe(DISCOVERY_AT);
    expect(toCanonicalUtcTimestamp("2026-09-21T09:42:00-04:00")).toBe(DISCOVERY_AT);
  });

  it("12. display timezone is America/New_York clock form", () => {
    expect(TRIGGER_TIME_DISPLAY_TIMEZONE).toBe("America/New_York");
    expect(formatTriggerTimeDisplay(DISCOVERY_AT)).toBe("09:42:00");
    expect(formatTriggerTimeDisplay("2026-09-21T14:17:00.000Z")).toBe("10:17:00");
    expect(formatTriggerTimeDisplay(HOD_BREAK_AT)).toBe("15:08:00");
    expect(evaluateScreenerTriggerTime(row({ last_hod_break_at: HOD_BREAK_AT })).display).toBe("15:08:00");
  });

  it("13. NEW semantics are unchanged — Trigger Time is a separate clock", () => {
    const adapter = readFileSync(resolve("src/lib/screeners/screener-trigger-time.ts"), "utf8");
    expect(adapter).not.toMatch(/NEW\b|newBadge|isNew|discoveryDuration/);
    expect(adapter).not.toMatch(/Date\.now|performance\.now|synced_at/);
    const grid = readFileSync(resolve("src/features/day-trade-radar-v2/RadarGrid.tsx"), "utf8");
    expect(grid).not.toMatch(/newBadge|isNewlyDiscovered/);
  });

  it("14. Discovery Rank / order is unchanged by trigger timestamps", () => {
    const lowTriggerHighVolume = row({
      symbol: "LOWT",
      session_volume: 9_000_000,
      promoted_at: LATER_DISCOVERY_AT,
    });
    const highTriggerLowVolume = row({
      symbol: "HIGHT",
      session_volume: 1_000_000,
      promoted_at: DISCOVERY_AT,
    });
    const ranked = rankRadarRows([lowTriggerHighVolume, highTriggerLowVolume], "available");
    expect(ranked.map((item) => item.symbol)).toEqual(["LOWT", "HIGHT"]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
  });

  it("15. compareCandidatesVolumeFirst is untouched", () => {
    const src = readFileSync(resolve("src/lib/screeners/radar-v2-adapter.ts"), "utf8");
    const fn = src.slice(
      src.indexOf("export function compareCandidatesVolumeFirst("),
      src.indexOf("export function rankRadarV2Candidates("),
    );
    expect(fn).toContain("d = descKey(b.session_volume) - descKey(a.session_volume)");
    expect(fn).not.toMatch(/trigger|promoted_at|last_hod_break_at/);
    expect(
      compareCandidatesVolumeFirst(
        candidate({ symbol: "LOWT", session_volume: 8_000_000, promoted_at: LATER_DISCOVERY_AT }),
        candidate({ symbol: "HIGHT", session_volume: 1_000_000, promoted_at: DISCOVERY_AT }),
      ),
    ).toBeLessThan(0);
  });

  it("17. unavailable displays an em dash", () => {
    expect(evaluateScreenerTriggerTime(row()).display).toBe("—");
    expect(formatTriggerTimeDisplay(null)).toBe("—");
    expect(formatTriggerTimeDisplay("")).toBe("—");
  });

  it("maps authentic HOD-break timestamps and prefers Discovery as primary", () => {
    const both = evaluateScreenerTriggerTime(
      row({ promoted_at: DISCOVERY_AT, last_hod_break_at: HOD_BREAK_AT }),
    );
    expect(both.state.events.map((event) => event.triggerType).sort()).toEqual([
      "DISCOVERY_TRIGGER",
      "HOD_BREAK_TRIGGER",
    ]);
    expect(both.primary?.triggerType).toBe("DISCOVERY_TRIGGER");
    expect(both.display).toBe("09:42:00");

    const hodOnly = evaluateScreenerTriggerTime(row({ last_hod_break_at: HOD_BREAK_AT }));
    expect(hodOnly.primary?.triggerType).toBe("HOD_BREAK_TRIGGER");
    expect(hodOnly.display).toBe("15:08:00");
  });

  it("DQ: authentic timestamps are AUTHORITATIVE with UNKNOWN freshness", () => {
    const quality = inspectScreenerTriggerQuality(row({ promoted_at: DISCOVERY_AT }));
    expect(quality.discovery.qualityState).toBe("AUTHORITATIVE");
    expect(quality.discovery.freshnessState).toBe("UNKNOWN");
    expect(quality.discovery.provenance).toBe("INTERNAL");
    expect(isUsableForDisplay(quality.discovery)).toBe(true);
    expect(isUsableForScoring(quality.discovery)).toBe(false);
    expect(isUsableForFiltering(quality.discovery)).toBe(false);
  });

  it("does not infer volume, HOD, or catalyst from current row state in the adapter", () => {
    const src = readFileSync(resolve("src/lib/screeners/screener-trigger-time.ts"), "utf8");
    expect(src).not.toMatch(/sessionVolume|session_volume/);
    expect(src).not.toMatch(/currentPrice|previousEstablishedHod/);
    expect(src).not.toMatch(/catalystQuality|sourcePublishedAt/);
  });

  it("carries authentic candidate timestamps through mapping", () => {
    const mapped = row({ promoted_at: DISCOVERY_AT, last_hod_break_at: HOD_BREAK_AT });
    expect(mapped.promoted_at).toBe(DISCOVERY_AT);
    expect(mapped.last_hod_break_at).toBe(HOD_BREAK_AT);
    expect(mapped.radar_trading_date).toBe(SESSION);
  });

  it("default screener columns lead with Triggered then Rank", () => {
    expect(DEFAULT_SCREENER_TAB_ID).toBe("day_trade_radar");
    for (const tab of SCREENER_TABS) {
      expect(tab.columns[0]).toMatchObject({ key: "trigger_time", format: "trigger_time" });
      expect(tab.columns[1]).toMatchObject({ key: "discovery_rank", format: "rank" });
      expect(tab.columns.some((column) => column.key === "trade_quality")).toBe(false);
    }
  });

  it("does not activate a Trigger Time filter", () => {
    const filters = readFileSync(resolve("src/components/screener/filters.config.ts"), "utf8");
    expect(filters).not.toMatch(/trigger_time|triggerTime|TRIGGER_/);
  });
});
