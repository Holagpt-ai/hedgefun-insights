import { describe, expect, it } from "vitest";
import { buildScannerTabEvidence } from "@/lib/screeners/scanner-tab-evidence";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

function row(partial: Partial<ScreenerResultRow>): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol: "ZZ",
    company_name: null,
    price: 10,
    change_percent: 12,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: 12,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    avg_volume_20d: null,
    rvol_20d: null,
    day_high: null,
    day_low: null,
    provider_as_of: "2026-09-30T08:00:00.000Z",
    sync_run_id: "run",
    updated_at: "2026-09-30T08:00:00.000Z",
    ...partial,
  };
}

describe("scanner tab evidence", () => {
  it("differentiates gappers vs gainers", () => {
    const gapper = buildScannerTabEvidence("gappers", row({ gap_percent: 8 }));
    const gainer = buildScannerTabEvidence("gainers_losers", row({ change_percent: 8, gap_percent: null }));
    expect(gapper?.primaryLabel).toContain("Gap");
    expect(gainer?.primaryLabel).toContain("Move");
  });

  it("labels prior-session ratio when it qualifies unusual volume", () => {
    const evidence = buildScannerTabEvidence(
      "unusual_volume",
      row({
        volume: 4_200_000,
        prior_session_volume: 1_000_000,
        volume_ratio_prior_session: 4.2,
      }),
    );
    expect(evidence?.primaryLabel).toContain("Vol/Yday");
    expect(evidence?.detail).toContain("prior-session");
    expect(evidence?.primaryLabel).not.toContain("RVOL 20D");
  });

  it("labels time-adjusted RVOL when it qualifies (not Vol/Yday)", () => {
    const evidence = buildScannerTabEvidence(
      "unusual_volume",
      row({
        volume: 500_000,
        prior_session_volume: 400_000,
        volume_ratio_prior_session: 1.25,
        time_adjusted_rvol: 2.4,
      } as Partial<ScreenerResultRow> & { time_adjusted_rvol: number }),
    );
    expect(evidence?.primaryLabel).toContain("Time-adjusted RVOL");
    expect(evidence?.detail).toMatch(/same-time-of-day/i);
    expect(evidence?.primaryLabel).not.toContain("Vol/Yday");
  });
});
