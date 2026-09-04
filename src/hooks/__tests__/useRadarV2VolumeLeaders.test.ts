import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

const { loadRadarV2Decision } = vi.hoisted(() => ({
  loadRadarV2Decision: vi.fn(),
}));

vi.mock("@/lib/screeners/radar-v2-source", () => ({
  loadRadarV2Decision,
}));

import {
  RADAR_REFRESH_MS,
  RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS,
  shouldPreserveVerifiedRadarV2OnSoftRefresh,
  useRadarV2VolumeLeaders,
} from "@/hooks/useRadarV2VolumeLeaders";

const GEN_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SYNCED_A = "2026-09-04T11:12:30.000Z";
const SYNCED_B = "2026-09-04T11:13:30.000Z";

function row(symbol: string, generationId: string, syncedAt: string): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 4.2,
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
    day_high: 5,
    day_low: 3,
    provider_as_of: syncedAt,
    sync_run_id: generationId,
    updated_at: syncedAt,
  };
}

function available(symbol: string, generationId: string, syncedAt: string): RadarV2Decision {
  return {
    source: "radar-v2",
    reason: "radar_v2_available",
    session: "pre-market",
    view: {
      status: "available",
      rows: [row(symbol, generationId, syncedAt)],
      synced_at: syncedAt,
      provider_as_of_max: syncedAt,
    },
  };
}

function empty(syncedAt: string): RadarV2Decision {
  return {
    source: "radar-v2",
    reason: "radar_v2_empty",
    session: "pre-market",
    view: {
      status: "empty",
      rows: [],
      synced_at: syncedAt,
      provider_as_of_max: syncedAt,
    },
  };
}

function fallback(reason: string): RadarV2Decision {
  return { source: "fallback", reason, session: "pre-market", view: null };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advancePoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RADAR_REFRESH_MS);
  });
}

describe("shouldPreserveVerifiedRadarV2OnSoftRefresh", () => {
  const prior = available("IMRN", GEN_A, SYNCED_A);

  it("never preserves on a hard/initial load", () => {
    expect(
      shouldPreserveVerifiedRadarV2OnSoftRefresh({
        soft: false,
        next: fallback("radar_v2_fetch_error"),
        prior,
      }),
    ).toBe(false);
  });

  it("preserves listed transient soft failures when a verified board exists", () => {
    for (const reason of RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS) {
      expect(
        shouldPreserveVerifiedRadarV2OnSoftRefresh({
          soft: true,
          next: fallback(reason),
          prior,
        }),
      ).toBe(true);
    }
  });

  it("does not preserve a valid available or healthy empty replacement", () => {
    expect(
      shouldPreserveVerifiedRadarV2OnSoftRefresh({
        soft: true,
        next: available("BAOS", GEN_B, SYNCED_B),
        prior,
      }),
    ).toBe(false);
    expect(
      shouldPreserveVerifiedRadarV2OnSoftRefresh({
        soft: true,
        next: empty(SYNCED_B),
        prior,
      }),
    ).toBe(false);
  });

  it("does not preserve when there is no prior verified Radar V2 decision", () => {
    expect(
      shouldPreserveVerifiedRadarV2OnSoftRefresh({
        soft: true,
        next: fallback("radar_v2_fetch_error"),
        prior: null,
      }),
    ).toBe(false);
    expect(
      shouldPreserveVerifiedRadarV2OnSoftRefresh({
        soft: true,
        next: fallback("radar_v2_retry_exhausted"),
        prior: fallback("radar_v2_fetch_error"),
      }),
    ).toBe(false);
  });
});

describe("useRadarV2VolumeLeaders — D11.2 soft-refresh retain", () => {
  let hidden = false;

  beforeEach(() => {
    hidden = false;
    loadRadarV2Decision.mockReset();
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1. initial valid Radar V2 available -> rows shown", async () => {
    loadRadarV2Decision.mockResolvedValue(available("IMRN", GEN_A, SYNCED_A));
    const { result } = renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.decision?.source).toBe("radar-v2");
    expect(result.current.decision?.view?.rows.map((r) => r.symbol)).toEqual(["IMRN"]);
    expect(result.current.decision?.view?.synced_at).toBe(SYNCED_A);
  });

  it("2. next background poll fetch error -> prior rows preserved", async () => {
    loadRadarV2Decision
      .mockResolvedValueOnce(available("IMRN", GEN_A, SYNCED_A))
      .mockResolvedValueOnce(fallback("radar_v2_fetch_error"));
    const { result } = renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    await advancePoll();
    expect(result.current.decision?.source).toBe("radar-v2");
    expect(result.current.decision?.view?.rows[0].symbol).toBe("IMRN");
    expect(result.current.decision?.view?.synced_at).toBe(SYNCED_A);
    expect(result.current.decision?.view?.provider_as_of_max).toBe(SYNCED_A);
    expect(loadRadarV2Decision).toHaveBeenCalledTimes(2);
  });

  it("3. next background poll retry exhausted -> prior rows preserved", async () => {
    loadRadarV2Decision
      .mockResolvedValueOnce(available("IMRN", GEN_A, SYNCED_A))
      .mockResolvedValueOnce(fallback("radar_v2_retry_exhausted"));
    const { result } = renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    await advancePoll();
    expect(result.current.decision?.reason).toBe("radar_v2_available");
    expect(result.current.decision?.view?.rows[0].symbol).toBe("IMRN");
  });

  it("4. next background poll valid newer generation -> rows replaced", async () => {
    loadRadarV2Decision
      .mockResolvedValueOnce(available("IMRN", GEN_A, SYNCED_A))
      .mockResolvedValueOnce(available("BAOS", GEN_B, SYNCED_B));
    const { result } = renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    await advancePoll();
    expect(result.current.decision?.view?.rows[0].symbol).toBe("BAOS");
    expect(result.current.decision?.view?.synced_at).toBe(SYNCED_B);
    expect(result.current.decision?.view?.rows[0].sync_run_id).toBe(GEN_B);
  });

  it("5. next background poll healthy empty -> board becomes honest empty", async () => {
    loadRadarV2Decision
      .mockResolvedValueOnce(available("IMRN", GEN_A, SYNCED_A))
      .mockResolvedValueOnce(empty(SYNCED_B));
    const { result } = renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    await advancePoll();
    expect(result.current.decision?.source).toBe("radar-v2");
    expect(result.current.decision?.reason).toBe("radar_v2_empty");
    expect(result.current.decision?.view?.status).toBe("empty");
    expect(result.current.decision?.view?.rows).toEqual([]);
    expect(result.current.decision?.view?.synced_at).toBe(SYNCED_B);
  });

  it("6. initial load failure with no prior verified rows -> unavailable", async () => {
    loadRadarV2Decision.mockResolvedValue(fallback("radar_v2_fetch_error"));
    const { result } = renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.decision?.source).toBe("fallback");
    expect(result.current.decision?.reason).toBe("radar_v2_fetch_error");
    expect(result.current.decision?.view).toBeNull();
  });

  it("7. session exit -> polling stops and Radar decision clears", async () => {
    loadRadarV2Decision.mockResolvedValue(available("IMRN", GEN_A, SYNCED_A));
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useRadarV2VolumeLeaders(enabled),
      { initialProps: { enabled: true } },
    );
    await flush();
    expect(result.current.decision?.view?.rows[0].symbol).toBe("IMRN");

    rerender({ enabled: false });
    expect(result.current.decision).toBeNull();
    expect(result.current.loading).toBe(false);

    loadRadarV2Decision.mockClear();
    await advancePoll();
    expect(loadRadarV2Decision).not.toHaveBeenCalled();
  });

  it("8. hidden document -> poll skipped", async () => {
    loadRadarV2Decision.mockResolvedValue(available("IMRN", GEN_A, SYNCED_A));
    renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    expect(loadRadarV2Decision).toHaveBeenCalledTimes(1);
    hidden = true;
    await advancePoll();
    expect(loadRadarV2Decision).toHaveBeenCalledTimes(1);
  });

  it("9. interval remains 60_000 ms", async () => {
    expect(RADAR_REFRESH_MS).toBe(60_000);
    loadRadarV2Decision.mockResolvedValue(available("IMRN", GEN_A, SYNCED_A));
    renderHook(() => useRadarV2VolumeLeaders(true));
    await flush();
    expect(loadRadarV2Decision).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RADAR_REFRESH_MS - 1);
    });
    expect(loadRadarV2Decision).toHaveBeenCalledTimes(1);
    await advancePoll();
    expect(loadRadarV2Decision).toHaveBeenCalledTimes(2);
  });
});
