import { describe, expect, it, vi, afterEach } from "vitest";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { VolumeLeadersView } from "@/lib/screeners/radar-v2-volume-leaders";
import type { PreMarketChecklistItem, PreMarketVolumeLeader, SectionEnvelope } from "@/types/pre-market";
import {
  applyPresentedVolumeLeadersToChecklist,
  buildRadarVerifyState,
  buildSessionMismatchPayload,
  emitPmVerify,
  EMPTY_RADAR_OBSERVE,
  isPmDebugEnabled,
  isRadarSessionMismatch,
  mapAmBriefVerifyState,
  PM_VERIFY_PREFIX,
  volumeLeaderChecklistLabel,
  VOLUME_LEADERS_CHECKLIST_ID,
} from "@/lib/pre-market/pm-verify";

const SYNCED = "2026-09-04T11:12:30.000Z";
const NOW = Date.parse("2026-09-04T11:13:30.000Z");

function section(rows: PreMarketVolumeLeader[]): SectionEnvelope<PreMarketVolumeLeader[]> {
  return { status: "available", data: rows, as_of: SYNCED, reason_code: null };
}

function radarRow(symbol: string): PreMarketVolumeLeader {
  return {
    symbol,
    company_name: null,
    price: 4,
    change_percent: null,
    volume: 1_000_000,
    rvol: null,
    updated_at: SYNCED,
  };
}

function legacyChecklist(count: number): PreMarketChecklistItem[] {
  return [
    { id: "watchlist_premarket", label: "Review 2 current Watchlist Pre-Market names", count: 2, route: "/dashboard/watchlist" },
    { id: VOLUME_LEADERS_CHECKLIST_ID, label: volumeLeaderChecklistLabel(count), count, route: "/dashboard/screeners" },
  ];
}

function radarView(overrides: Partial<VolumeLeadersView> = {}): VolumeLeadersView {
  return {
    section: section([radarRow("IMRN"), radarRow("BAOS")]),
    loading: false,
    subtitle: "Radar",
    emptyMessage: "empty",
    source: "radar-v2",
    ...overrides,
  };
}

describe("pmDebug gate", () => {
  it("is off unless pmDebug=1", () => {
    expect(isPmDebugEnabled(null)).toBe(false);
    expect(isPmDebugEnabled("")).toBe(false);
    expect(isPmDebugEnabled("pmDebug=true")).toBe(false);
    expect(isPmDebugEnabled("pmDebug=0")).toBe(false);
    expect(isPmDebugEnabled("pmDebug=")).toBe(false);
    expect(isPmDebugEnabled("radarDebug=1")).toBe(false);
    expect(isPmDebugEnabled("pmDebug=1")).toBe(true);
    expect(isPmDebugEnabled("?pmDebug=1")).toBe(true);
    expect(isPmDebugEnabled(new URLSearchParams("pmDebug=1"))).toBe(true);
  });

  it("does not log when the gate is off", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    emitPmVerify(false, "radar-state", { source: "radar-v2" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits the verify prefix when the gate is on", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    emitPmVerify(true, "radar-state", { source: "radar-v2" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(PM_VERIFY_PREFIX);
    expect(spy.mock.calls[0][1]).toBe("radar-state");
    expect(spy.mock.calls[0][2]).toEqual({ source: "radar-v2" });
    spy.mockRestore();
  });
});

describe("session mismatch detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flags Polygon premarket vs Radar market/closed and does not rewrite sessions", () => {
    const polygon = "premarket" as const;
    const radarMarket = "market";
    const radarClosed = "closed";
    expect(isRadarSessionMismatch(polygon, radarMarket)).toBe(true);
    expect(isRadarSessionMismatch(polygon, radarClosed)).toBe(true);
    expect(isRadarSessionMismatch(polygon, "pre-market")).toBe(false);
    expect(isRadarSessionMismatch("regular", "pre-market")).toBe(false);
    expect(isRadarSessionMismatch("premarket", null)).toBe(false);

    const payload = buildSessionMismatchPayload(polygon, radarMarket);
    expect(payload).toEqual({ polygonSession: "premarket", radarSession: "market" });
    expect(payload.polygonSession).toBe(polygon);
    expect(payload.radarSession).toBe(radarMarket);
  });

  it("radar-state mapping reports mismatch without correcting source", () => {
    const decision: RadarV2Decision = {
      source: "radar-v2",
      reason: "radar_v2_available",
      session: "market",
      view: { status: "available", rows: [], synced_at: SYNCED, provider_as_of_max: null },
    };
    const state = buildRadarVerifyState({
      nowMs: NOW,
      polygonSession: "premarket",
      radarDecision: decision,
      volumeLeadersView: radarView({ section: section([]) }),
      observe: EMPTY_RADAR_OBSERVE,
    });
    expect(state.sessionMismatch).toBe(true);
    expect(state.polygonSession).toBe("premarket");
    expect(state.radarSession).toBe("market");
    expect(state.decisionSource).toBe("radar-v2");
    expect(state.reason).toBe("radar_v2_available");
  });
});

describe("Opening Bell checklist volume-leader source", () => {
  it("confirmed pre-market + verified Radar rows uses the Radar count", () => {
    const items = applyPresentedVolumeLeadersToChecklist({
      premarketActive: true,
      items: legacyChecklist(6),
      volumeLeadersView: radarView(),
    });
    const vl = items.find((i) => i.id === VOLUME_LEADERS_CHECKLIST_ID);
    expect(vl?.count).toBe(2);
    expect(vl?.label).toBe(volumeLeaderChecklistLabel(2));
    expect(items.some((i) => i.id === "watchlist_premarket")).toBe(true);
  });

  it("confirmed pre-market + healthy Radar empty is zero (item omitted)", () => {
    const items = applyPresentedVolumeLeadersToChecklist({
      premarketActive: true,
      items: legacyChecklist(6),
      volumeLeadersView: radarView({
        source: "radar-v2",
        section: { status: "empty", data: [], as_of: SYNCED, reason_code: "NO_QUALIFYING_DATA" },
      }),
    });
    expect(items.find((i) => i.id === VOLUME_LEADERS_CHECKLIST_ID)).toBeUndefined();
    expect(items.some((i) => i.id === "watchlist_premarket")).toBe(true);
  });

  it("confirmed pre-market + Radar unavailable does not count legacy screener rows", () => {
    const items = applyPresentedVolumeLeadersToChecklist({
      premarketActive: true,
      items: legacyChecklist(6),
      volumeLeadersView: radarView({
        source: "unavailable",
        section: { status: "unavailable", data: [], as_of: null, reason_code: "RADAR_V2_UNAVAILABLE" },
      }),
    });
    expect(items.find((i) => i.id === VOLUME_LEADERS_CHECKLIST_ID)).toBeUndefined();
    expect(items.every((i) => i.count !== 6 || i.id !== VOLUME_LEADERS_CHECKLIST_ID)).toBe(true);
  });

  it("outside pre-market keeps the workspace checklist unchanged", () => {
    const original = legacyChecklist(6);
    const items = applyPresentedVolumeLeadersToChecklist({
      premarketActive: false,
      items: original,
      volumeLeadersView: radarView(),
    });
    expect(items.find((i) => i.id === VOLUME_LEADERS_CHECKLIST_ID)?.count).toBe(6);
    expect(items).toEqual(original);
  });
});

describe("AM brief verify mapping", () => {
  it("maps client-visible fields and records the cached/generated API limitation", () => {
    const mapped = mapAmBriefVerifyState({
      kind: "available",
      httpStatus: 200,
      reason: null,
      generatedAt: "2026-09-04T11:05:00.000Z",
      sourceCheckedAt: "2026-09-04T11:04:00.000Z",
      briefDate: "2026-09-04",
      previousTradingDay: false,
      nowEtDate: "2026-09-04",
    });
    expect(mapped.available).toBe(true);
    expect(mapped.isCurrentEtTradingDay).toBe(true);
    expect(mapped.httpStatusCategory).toBe("2xx");
    expect(mapped.cachedVsGenerated).toBeNull();
    expect(mapped.cachedVsGeneratedAvailable).toBe(false);
  });
});
