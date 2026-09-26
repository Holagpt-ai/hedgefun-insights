/**
 * Radar Event Engine V1 tests (sprint acceptance).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_RADAR_EVENT_ENGINE_CONFIG,
  RADAR_EVENT_ENGINE_RESERVED_TYPES,
  emptyRadarEventEngineState,
  stepRadarEventEngine,
  type RadarEventEngineStepInput,
} from "@/lib/radar/radar-event-engine";

const DATE = "2026-09-26";
const T0 = Date.parse("2026-09-26T14:00:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function baseInput(
  over: Partial<RadarEventEngineStepInput> = {},
): RadarEventEngineStepInput {
  return {
    symbol: "AAA",
    surveillanceDate: DATE,
    eventNowMs: T0,
    emitEvents: true,
    detect: true,
    active: true,
    sessionVolume: 50_000,
    lastPrice: 5,
    vol5s: 10_000,
    vol15s: 20_000,
    vol60s: 40_000,
    volumeAccelerationPct: 25,
    move15sPct: 0.5,
    move15Complete: true,
    sessionHigh: 5.2,
    sessionVwap: 4.9,
    vwapSide: "above",
    distanceFromHodPct: 3.8,
    freshnessAgeMs: 2_000,
    isoFromMs: (ms) => iso(ms),
    ...over,
  };
}

function step(
  prev: ReturnType<typeof emptyRadarEventEngineState> | null,
  over: Partial<RadarEventEngineStepInput> = {},
) {
  return stepRadarEventEngine(prev, baseInput(over), DEFAULT_RADAR_EVENT_ENGINE_CONFIG);
}

describe("Radar Event Engine V1", () => {
  it("1. VOLUME_100K fires once per session", () => {
    let state = emptyRadarEventEngineState(DATE);
    const first = step(state, { sessionVolume: 100_000 });
    state = first.state;
    expect(first.newEvents.some((e) => e.type === "VOLUME_100K")).toBe(true);
    const second = step(state, { sessionVolume: 150_000, eventNowMs: T0 + 5_000 });
    expect(second.newEvents.filter((e) => e.type === "VOLUME_100K")).toHaveLength(0);
    expect(second.state.records.filter((e) => e.type === "VOLUME_100K")).toHaveLength(1);
  });

  it("2. VOLUME_500K fires once", () => {
    let state = emptyRadarEventEngineState(DATE);
    const r1 = step(state, { sessionVolume: 500_000 });
    state = r1.state;
    expect(r1.newEvents.some((e) => e.type === "VOLUME_500K")).toBe(true);
    const r2 = step(state, { sessionVolume: 600_000, eventNowMs: T0 + 1_000 });
    expect(r2.newEvents.filter((e) => e.type === "VOLUME_500K")).toHaveLength(0);
  });

  it("3. VOLUME_1M fires once", () => {
    let state = emptyRadarEventEngineState(DATE);
    const r1 = step(state, { sessionVolume: 1_000_000 });
    expect(r1.newEvents.some((e) => e.type === "VOLUME_1M")).toBe(true);
    const r2 = step(r1.state, { sessionVolume: 1_100_000, eventNowMs: T0 + 1_000 });
    expect(r2.newEvents.filter((e) => e.type === "VOLUME_1M")).toHaveLength(0);
  });

  it("4. NEW_HOD only on higher HOD", () => {
    let state = emptyRadarEventEngineState(DATE);
    const r1 = step(state, { sessionHigh: 5 });
    state = r1.state;
    expect(r1.newEvents.filter((e) => e.type === "NEW_HOD")).toHaveLength(0);
    const r2 = step(state, { sessionHigh: 5.01, eventNowMs: T0 + 1_000 });
    expect(r2.newEvents.some((e) => e.type === "NEW_HOD")).toBe(true);
    const r3 = step(r2.state, { sessionHigh: 5.01, eventNowMs: T0 + 2_000 });
    expect(r3.newEvents.filter((e) => e.type === "NEW_HOD")).toHaveLength(0);
  });

  it("5. VWAP reclaim transition", () => {
    let state = emptyRadarEventEngineState(DATE);
    state.prevVwapSide = "below";
    const r = step(state, { vwapSide: "above" });
    expect(r.newEvents.some((e) => e.type === "VWAP_RECLAIM")).toBe(true);
  });

  it("6. VWAP loss transition", () => {
    let state = emptyRadarEventEngineState(DATE);
    state.prevVwapSide = "above";
    const r = step(state, { vwapSide: "below" });
    expect(r.newEvents.some((e) => e.type === "VWAP_LOSS")).toBe(true);
  });

  it("7. pullback lifecycle transition", () => {
    let state = emptyRadarEventEngineState(DATE);
    let r = step(state, { active: true, move15sPct: 0.4, move15Complete: true });
    state = r.state;
    expect(state.phase).toBe("MOMENTUM");
    r = step(state, {
      active: false,
      move15sPct: -0.2,
      move15Complete: true,
      eventNowMs: T0 + 5_000,
    });
    expect(r.lifecycle).toBe("PULLBACK");
    expect(r.newEvents.some((e) => e.type === "PULLBACK")).toBe(true);
  });

  it("8. re-acceleration requires prior pullback", () => {
    let state = emptyRadarEventEngineState(DATE);
    state.phase = "MOMENTUM";
    state.momentumLegConfirmed = true;
    let r = step(state, {
      active: false,
      move15sPct: -0.2,
      move15Complete: true,
    });
    state = r.state;
    expect(state.phase).toBe("PULLBACK");
    r = step(state, { active: true, move15sPct: 0.3, move15Complete: true, eventNowMs: T0 + 10_000 });
    expect(r.newEvents.some((e) => e.type === "RE_ACCELERATION")).toBe(true);
  });

  it("9. second leg requires prior leg and pullback", () => {
    let state = emptyRadarEventEngineState(DATE);
    state.phase = "PULLBACK";
    state.momentumLegConfirmed = true;
    state.hadPullbackSinceLeg = true;
    let r = step(state, {
      active: true,
      move15sPct: 0.3,
      move15Complete: true,
      eventNowMs: T0 + 1_000,
    });
    state = r.state;
    expect(state.phase).toBe("RE_ACCELERATING");
    r = step(state, {
      active: true,
      move15sPct: 0.4,
      move15Complete: true,
      eventNowMs: T0 + 2_000,
    });
    expect(r.lifecycle).toBe("SECOND_LEG");
    expect(r.newEvents.some((e) => e.type === "SECOND_LEG")).toBe(true);
  });

  it("10. duplicate ticks do not duplicate events", () => {
    let state = emptyRadarEventEngineState(DATE);
    const r1 = step(state, {
      sessionVolume: 100_000,
      active: false,
      detect: false,
      move15Complete: false,
    });
    const r2 = step(r1.state, {
      sessionVolume: 100_000,
      eventNowMs: T0 + 500,
      active: false,
      detect: false,
      move15Complete: false,
    });
    expect(r2.newEvents).toHaveLength(0);
    expect(r2.state.records).toHaveLength(r1.state.records.length);
  });

  it("11. next surveillance date resets state", () => {
    let state = emptyRadarEventEngineState(DATE);
    const r1 = step(state, { sessionVolume: 100_000 });
    const r2 = step(r1.state, {
      surveillanceDate: "2026-09-27",
      sessionVolume: 100_000,
      eventNowMs: T0 + 86_400_000,
    });
    expect(r2.newEvents.some((e) => e.type === "VOLUME_100K")).toBe(true);
    expect(r2.state.volumeFired.VOLUME_100K).toBe(true);
  });

  it("12. closed session emits no new synthetic events", () => {
    const r = step(null, { emitEvents: false, sessionVolume: 1_000_000 });
    expect(r.newEvents).toHaveLength(0);
  });

  it("13. missing unsupported evidence remains null", () => {
    const r = step(null, {
      sessionVolume: 100_000,
      vol5s: null,
      volumeAccelerationPct: null,
      move15Complete: false,
      move15sPct: null,
    });
    const ev = r.newEvents.find((e) => e.type === "VOLUME_100K");
    expect(ev?.evidence.volume5s).toBeNull();
    expect(ev?.evidence.volumeAccelerationPct).toBeNull();
    expect(ev?.evidence.priceChangeShortWindowPct).toBeNull();
  });

  it("14. promotion explanation uses real event evidence", () => {
    const r = step(null, { sessionVolume: 500_000, active: true, move15sPct: 0.5, move15Complete: true });
    expect(r.promotionReason.version).toBe("v1");
    expect(r.promotionReason.primaryEvent).not.toBeNull();
    expect(r.promotionReason.evidenceSnapshot?.cumulativeVolume).toBe(500_000);
  });

  it("15. promotion explanation is bounded and does not require ranking fields", () => {
    const r = step(null, { sessionVolume: 500_000, active: true, move15Complete: true, move15sPct: 0.2 });
    expect(r.promotionReason.version).toBe("v1");
    expect(r.promotionReason.supportingEvents.length).toBeLessThanOrEqual(5);
    expect(r.state.records.length).toBeLessThanOrEqual(32);
  });

  it("16. HALT/RESUME reserved without inference", () => {
    expect(RADAR_EVENT_ENGINE_RESERVED_TYPES).toEqual(["HALT", "RESUME"]);
    const r = step(null, { sessionVolume: 100_000 });
    expect(r.newEvents.length).toBeGreaterThan(0);
  });
});
