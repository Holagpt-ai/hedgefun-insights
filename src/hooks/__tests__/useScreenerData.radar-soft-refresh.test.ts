import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerResultRow, ScreenerTabView } from "@/lib/screeners/contract";

const { loadRadarV2Decision, loadVerifiedScreenerGeneration } = vi.hoisted(() => ({
  loadRadarV2Decision: vi.fn(),
  loadVerifiedScreenerGeneration: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null });
            },
            in() {
              return {
                order() {
                  return {
                    order() {
                      return { limit: () => Promise.resolve({ data: [], error: null }) };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/lib/screeners/radar-v2-source", () => ({
  loadRadarV2Decision,
}));

vi.mock("@/lib/screeners/contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/screeners/contract")>();
  return { ...actual, loadVerifiedScreenerGeneration };
});

import { useScreenerData } from "@/hooks/useScreenerData";
import {
  recordRadarV2LoadDiagnostic,
  resetRadarV2LoadDiagnostic,
} from "@/lib/screeners/radar-v2-diagnostics";

const GEN_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SYNCED_A = "2026-09-04T17:12:30.000Z";
const SYNCED_B = "2026-09-04T17:13:30.000Z";

function row(symbol: string, generationId: string, syncedAt: string): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 8,
    change_percent: null,
    volume: 9_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 9,
    day_low: 7,
    provider_as_of: syncedAt,
    sync_run_id: generationId,
    updated_at: syncedAt,
  };
}

function radarAvailable(symbol: string, generationId: string, syncedAt: string, session = "market"): RadarV2Decision {
  return {
    source: "radar-v2",
    reason: "radar_v2_available",
    session,
    view: {
      status: "available",
      rows: [row(symbol, generationId, syncedAt)],
      synced_at: syncedAt,
      provider_as_of_max: syncedAt,
    },
  };
}

function radarFallback(reason: string): RadarV2Decision {
  return { source: "fallback", reason, session: "market", view: null };
}

function legacyAvailable(symbol: string): ScreenerTabView {
  return {
    status: "available",
    rows: [
      {
        ...row(symbol, GEN_A, SYNCED_A),
        price: 10,
        change_percent: 12,
        volume_ratio_prior_session: 8,
      },
    ],
    synced_at: SYNCED_A,
    provider_as_of_max: SYNCED_A,
    attempts: 1,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useScreenerData Radar V2 soft-refresh preserve (D13)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRadarV2LoadDiagnostic();
    loadRadarV2Decision.mockReset();
    loadVerifiedScreenerGeneration.mockReset();
    loadVerifiedScreenerGeneration.mockResolvedValue(legacyAvailable("LEGACY"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("6–7. transient poll failure keeps Radar V2 rows/source/session", async () => {
    loadRadarV2Decision
      .mockResolvedValueOnce(radarAvailable("IMRN", GEN_A, SYNCED_A))
      .mockResolvedValueOnce(radarFallback("radar_v2_fetch_error"))
      .mockResolvedValueOnce(radarFallback("radar_v2_retry_exhausted"));

    const { result } = renderHook(() =>
      useScreenerData("day_trade_radar", { refreshIntervalMs: 60_000, pauseWhenHidden: true }),
    );
    await flush();

    expect(result.current.source).toBe("radar-v2");
    expect(result.current.session).toBe("market");
    expect(result.current.rows[0].symbol).toBe("IMRN");
    expect(result.current.syncedAt).toBe(SYNCED_A);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.source).toBe("radar-v2");
    expect(result.current.rows[0].symbol).toBe("IMRN");
    expect(result.current.session).toBe("market");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.source).toBe("radar-v2");
    expect(result.current.rows[0].symbol).toBe("IMRN");
  });

  it("D15. diagnostic snapshot updates on each poll, including preserve", async () => {
    loadRadarV2Decision
      .mockImplementationOnce(async () => {
        recordRadarV2LoadDiagnostic({
          reason: "radar_v2_available",
          source: "radar-v2",
          session: "market",
          attempts: 1,
          generationId: GEN_A,
          declaredCandidateCount: 1,
          lastAttemptReason: null,
        });
        return radarAvailable("IMRN", GEN_A, SYNCED_A);
      })
      .mockImplementationOnce(async () => {
        recordRadarV2LoadDiagnostic({
          reason: "radar_v2_fetch_error",
          source: "fallback",
          session: "market",
          attempts: 1,
          generationId: GEN_A,
          declaredCandidateCount: 1,
          lastAttemptReason: "radar_v2_fetch_error",
        });
        return radarFallback("radar_v2_fetch_error");
      });

    const { result } = renderHook(() =>
      useScreenerData("day_trade_radar", { refreshIntervalMs: 60_000, pauseWhenHidden: true }),
    );
    await flush();
    expect(result.current.radarDiagnostic?.reason).toBe("radar_v2_available");
    expect(result.current.source).toBe("radar-v2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.source).toBe("radar-v2");
    expect(result.current.rows[0].symbol).toBe("IMRN");
    expect(result.current.radarDiagnostic?.reason).toBe("radar_v2_fetch_error");
    expect(result.current.radarDiagnostic?.source).toBe("fallback");
  });

  it("8. valid newer Radar generation replaces the prior board", async () => {
    loadRadarV2Decision
      .mockResolvedValueOnce(radarAvailable("OLD", GEN_A, SYNCED_A))
      .mockResolvedValueOnce(radarAvailable("NEW", GEN_B, SYNCED_B));

    const { result } = renderHook(() =>
      useScreenerData("day_trade_radar", { refreshIntervalMs: 60_000 }),
    );
    await flush();
    expect(result.current.rows[0].symbol).toBe("OLD");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.source).toBe("radar-v2");
    expect(result.current.rows[0].symbol).toBe("NEW");
    expect(result.current.syncedAt).toBe(SYNCED_B);
  });

  it("10. initial Radar unavailable uses legacy fallback", async () => {
    loadRadarV2Decision.mockResolvedValueOnce(radarFallback("radar_v2_stale"));
    const { result } = renderHook(() => useScreenerData("day_trade_radar"));
    await flush();
    expect(result.current.source).toBe("screener-results");
    expect(result.current.session).toBeNull();
    expect(result.current.rows[0].symbol).toBe("LEGACY");
  });
});
