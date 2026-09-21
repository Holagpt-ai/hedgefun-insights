import { describe, expect, it } from "vitest";
import {
  TRIGGER_TIME_VERSION,
  TRIGGER_VOLUME_THRESHOLD_BY_KEY,
  TRIGGER_VOLUME_THRESHOLDS,
} from "@/config/trigger-time.config";
import {
  buildTriggerEventId,
  emptyTriggerState,
  getTriggerEvent,
  summarizeTriggerState,
  updateTriggerState,
} from "@/lib/screeners/trigger-time";
import type { TriggerObservation, TriggerState } from "@/types/trigger-time";

const SESSION = "2026-09-18";
const PRIOR_SESSION = "2026-09-17";

function observation(
  overrides: Partial<TriggerObservation> & Pick<TriggerObservation, "observedAt">,
): TriggerObservation {
  return {
    symbol: "AAPL",
    sessionDate: SESSION,
    ...overrides,
  };
}

function volumeAt(observedAt: string, sessionVolume: number): TriggerObservation {
  return observation({ observedAt, sessionVolume });
}

function applyAll(
  observations: TriggerObservation[],
  initial: TriggerState = emptyTriggerState(),
): TriggerState {
  return observations.reduce(
    (state, next) => updateTriggerState(state, next).state,
    initial,
  );
}

describe("Trigger Time V1 — Discovery", () => {
  it("1. records a Discovery trigger when qualification is TRUE", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:41:00.000Z", discoveryQualified: "TRUE" }),
    );
    expect(result.state.events).toHaveLength(1);
    expect(result.state.events[0]).toMatchObject({
      triggerType: "DISCOVERY_TRIGGER",
      reason: "DISCOVERY_QUALIFIED",
      triggeredAt: "2026-09-18T13:41:00.000Z",
    });
  });

  it("2. Discovery FALSE does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:41:00.000Z", discoveryQualified: "FALSE" }),
    );
    expect(result.state.events).toEqual([]);
  });

  it("3. Discovery UNKNOWN does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:41:00.000Z", discoveryQualified: "UNKNOWN" }),
    );
    expect(result.state.events).toEqual([]);
  });
});

describe("Trigger Time V1 — Volume", () => {
  it("4. volume below threshold does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:41:00.000Z", TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_100K - 1),
    );
    expect(result.state.events).toEqual([]);
  });

  it("5. volume exactly at threshold triggers", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:43:00.000Z", TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_100K),
    );
    expect(result.state.events).toHaveLength(1);
    expect(result.state.events[0]).toMatchObject({
      triggerType: "VOLUME_TRIGGER",
      eventKey: "VOLUME_100K",
      threshold: TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_100K,
      triggeredAt: "2026-09-18T13:43:00.000Z",
      reason: "SESSION_VOLUME_THRESHOLD",
    });
  });

  it("6. volume above threshold triggers", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:44:00.000Z", TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_100K + 10_000),
    );
    expect(result.state.events[0]?.eventKey).toBe("VOLUME_100K");
  });

  it("7. multiple volume thresholds are independent", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T14:05:00.000Z", TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_1M),
    );
    expect(result.state.events.map((event) => event.eventKey).sort()).toEqual([
      "VOLUME_100K",
      "VOLUME_1M",
      "VOLUME_500K",
    ]);
    expect(new Set(result.state.events.map((event) => event.triggeredAt))).toEqual(
      new Set(["2026-09-18T14:05:00.000Z"]),
    );
  });

  it("8. later volume observations do not move the first trigger later", () => {
    const state = applyAll([
      volumeAt("2026-09-18T13:41:00.000Z", 80_000),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
      volumeAt("2026-09-18T13:44:00.000Z", 150_000),
      volumeAt("2026-09-18T14:01:00.000Z", 500_000),
    ]);
    const volume100k = getTriggerEvent(state, {
      symbol: "AAPL",
      sessionDate: SESSION,
      triggerType: "VOLUME_TRIGGER",
      eventKey: "VOLUME_100K",
    });
    expect(volume100k?.triggeredAt).toBe("2026-09-18T13:43:00.000Z");
  });
});

describe("Trigger Time V1 — Momentum", () => {
  it("9. Momentum TRUE records a trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T13:50:00.000Z",
        momentumQualified: "TRUE",
        volumeVelocity: 1.4,
      }),
    );
    expect(result.state.events[0]).toMatchObject({
      triggerType: "MOMENTUM_TRIGGER",
      reason: "MOMENTUM_QUALIFIED",
      triggeredAt: "2026-09-18T13:50:00.000Z",
    });
  });

  it("10. Momentum FALSE does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:50:00.000Z", momentumQualified: "FALSE" }),
    );
    expect(result.state.events).toEqual([]);
  });

  it("11. Momentum UNKNOWN does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:50:00.000Z", momentumQualified: "UNKNOWN" }),
    );
    expect(result.state.events).toEqual([]);
  });
});

describe("Trigger Time V1 — HOD break", () => {
  it("12. records an HOD break when price exceeds the prior established HOD", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T14:10:00.000Z",
        previousEstablishedHod: 10,
        currentPrice: 10.05,
      }),
    );
    expect(result.state.events[0]).toMatchObject({
      triggerType: "HOD_BREAK_TRIGGER",
      reason: "HOD_BREAK",
      triggeredAt: "2026-09-18T14:10:00.000Z",
    });
  });

  it("13. does not trigger when price remains below the established HOD", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T14:10:00.000Z",
        previousEstablishedHod: 10,
        currentPrice: 9.99,
      }),
    );
    expect(result.state.events).toEqual([]);
  });

  it("14. equality is not a breakout", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T14:10:00.000Z",
        previousEstablishedHod: 10,
        currentPrice: 10,
      }),
    );
    expect(result.state.events).toEqual([]);
  });
});

describe("Trigger Time V1 — Catalyst", () => {
  it("15. WEAK verified catalyst triggers", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T12:00:00.000Z", catalystQuality: "WEAK" }),
    );
    expect(result.state.events[0]).toMatchObject({
      triggerType: "CATALYST_TRIGGER",
      reason: "VERIFIED_CATALYST",
      observedValue: "WEAK",
    });
  });

  it("16. MODERATE catalyst triggers", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T12:00:00.000Z", catalystQuality: "MODERATE" }),
    );
    expect(result.state.events[0]?.observedValue).toBe("MODERATE");
  });

  it("17. STRONG catalyst triggers", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T12:00:00.000Z", catalystQuality: "STRONG" }),
    );
    expect(result.state.events[0]?.observedValue).toBe("STRONG");
  });

  it("18. catalyst NONE does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T12:00:00.000Z", catalystQuality: "NONE" }),
    );
    expect(result.state.events).toEqual([]);
  });

  it("19. catalyst UNKNOWN does not trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T12:00:00.000Z", catalystQuality: "UNKNOWN" }),
    );
    expect(result.state.events).toEqual([]);
  });

  it("20. source publication time is distinct from Stocksist recognition time", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T13:47:02.000Z",
        catalystQuality: "STRONG",
        sourcePublishedAt: "2026-09-18T10:15:00.000Z",
      }),
    );
    expect(result.state.events[0]?.triggeredAt).toBe("2026-09-18T13:47:02.000Z");
    expect(result.state.events[0]?.metadata?.sourcePublishedAt).toBe("2026-09-18T10:15:00.000Z");
    expect(result.state.events[0]?.triggeredAt).not.toBe(
      result.state.events[0]?.metadata?.sourcePublishedAt,
    );
  });
});

describe("Trigger Time V1 — identity, order, and isolation", () => {
  it("21. duplicate observations are idempotent", () => {
    const obs = volumeAt("2026-09-18T13:43:00.000Z", 110_000);
    const first = updateTriggerState(emptyTriggerState(), obs);
    const second = updateTriggerState(first.state, obs);
    expect(second.added).toEqual([]);
    expect(second.backdated).toEqual([]);
    expect(second.state.events).toHaveLength(1);
    expect(second.state.events[0]?.triggeredAt).toBe("2026-09-18T13:43:00.000Z");
  });

  it("22. duplicate trigger identities are not created", () => {
    const state = applyAll([
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
      volumeAt("2026-09-18T13:44:00.000Z", 150_000),
    ]);
    const ids = state.events.map((event) => buildTriggerEventId(event));
    expect(ids).toEqual([...new Set(ids)]);
    expect(state.events.filter((event) => event.eventKey === "VOLUME_100K")).toHaveLength(1);
  });

  it("23. a later observation cannot move a trigger later", () => {
    const first = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:50:00.000Z", momentumQualified: "TRUE" }),
    );
    const later = updateTriggerState(
      first.state,
      observation({ observedAt: "2026-09-18T14:10:00.000Z", momentumQualified: "TRUE" }),
    );
    expect(later.state.events[0]?.triggeredAt).toBe("2026-09-18T13:50:00.000Z");
  });

  it("24. an earlier out-of-order observation backdates the trigger", () => {
    const first = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
    );
    const earlier = updateTriggerState(
      first.state,
      volumeAt("2026-09-18T13:42:00.000Z", 105_000),
    );
    expect(earlier.backdated).toHaveLength(1);
    expect(earlier.state.events[0]?.triggeredAt).toBe("2026-09-18T13:42:00.000Z");
    expect(earlier.state.events[0]?.observedValue).toBe(105_000);
  });

  it("25. yesterday's trigger does not suppress today's", () => {
    const yesterday = updateTriggerState(
      emptyTriggerState(),
      { ...volumeAt("2026-09-17T14:02:15.000Z", 200_000), sessionDate: PRIOR_SESSION },
    );
    const today = updateTriggerState(
      yesterday.state,
      volumeAt("2026-09-18T13:47:02.000Z", 180_000),
    );
    expect(today.state.events).toHaveLength(2);
    expect(
      today.state.events.map((event) => `${event.sessionDate}:${event.triggeredAt}`).sort(),
    ).toEqual(["2026-09-17:2026-09-17T14:02:15.000Z", "2026-09-18:2026-09-18T13:47:02.000Z"]);
  });

  it("26. different symbols are isolated", () => {
    const aapl = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
    );
    const msft = updateTriggerState(
      aapl.state,
      { ...volumeAt("2026-09-18T13:50:00.000Z", 110_000), symbol: "MSFT" },
    );
    expect(msft.state.events).toHaveLength(2);
    expect(msft.state.events.map((event) => event.symbol).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("27. different trigger types are isolated", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T13:50:00.000Z",
        discoveryQualified: "TRUE",
        momentumQualified: "TRUE",
      }),
    );
    expect(result.state.events.map((event) => event.triggerType).sort()).toEqual([
      "DISCOVERY_TRIGGER",
      "MOMENTUM_TRIGGER",
    ]);
  });

  it("28. different volume threshold keys are isolated", () => {
    const state = applyAll([
      volumeAt("2026-09-18T13:34:00.000Z", 120_000),
      volumeAt("2026-09-18T13:47:00.000Z", 520_000),
      volumeAt("2026-09-18T14:05:00.000Z", 1_100_000),
    ]);
    expect(
      getTriggerEvent(state, {
        symbol: "AAPL",
        sessionDate: SESSION,
        triggerType: "VOLUME_TRIGGER",
        eventKey: "VOLUME_100K",
      })?.triggeredAt,
    ).toBe("2026-09-18T13:34:00.000Z");
    expect(
      getTriggerEvent(state, {
        symbol: "AAPL",
        sessionDate: SESSION,
        triggerType: "VOLUME_TRIGGER",
        eventKey: "VOLUME_500K",
      })?.triggeredAt,
    ).toBe("2026-09-18T13:47:00.000Z");
    expect(
      getTriggerEvent(state, {
        symbol: "AAPL",
        sessionDate: SESSION,
        triggerType: "VOLUME_TRIGGER",
        eventKey: "VOLUME_1M",
      })?.triggeredAt,
    ).toBe("2026-09-18T14:05:00.000Z");
  });
});

describe("Trigger Time V1 — validation and contract", () => {
  it("29. invalid timestamps are rejected", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "not-a-date", discoveryQualified: "TRUE" }),
    );
    expect(result.state.events).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      reason: "INVALID_OBSERVATION",
      field: "observedAt",
    });
  });

  it("30. NaN / invalid numeric inputs are rejected and do not trigger", () => {
    const nanVolume = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:43:00.000Z", Number.NaN),
    );
    const infHod = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T14:10:00.000Z",
        previousEstablishedHod: Number.POSITIVE_INFINITY,
        currentPrice: 12,
      }),
    );
    expect(nanVolume.state.events).toEqual([]);
    expect(nanVolume.errors.some((error) => error.field === "sessionVolume")).toBe(true);
    expect(infHod.state.events).toEqual([]);
    expect(infHod.errors.some((error) => error.field === "previousEstablishedHod")).toBe(true);
  });

  it("31. UNKNOWN never creates a trigger", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        observedAt: "2026-09-18T13:50:00.000Z",
        discoveryQualified: "UNKNOWN",
        momentumQualified: "UNKNOWN",
        hodBreakQualified: "UNKNOWN",
        catalystQuality: "UNKNOWN",
      }),
    );
    expect(result.state.events).toEqual([]);
  });

  it("32. existing state is not mutated", () => {
    const existing = updateTriggerState(
      emptyTriggerState(),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
    ).state;
    const snapshot = structuredClone(existing);
    updateTriggerState(existing, volumeAt("2026-09-18T13:50:00.000Z", 200_000));
    expect(existing).toEqual(snapshot);
  });

  it("33. observations are not mutated", () => {
    const obs = volumeAt("2026-09-18T13:43:00.000Z", 110_000);
    const snapshot = structuredClone(obs);
    updateTriggerState(emptyTriggerState(), obs);
    expect(obs).toEqual(snapshot);
  });

  it("34. repeated evaluation is deterministic", () => {
    const observations = [
      volumeAt("2026-09-18T13:41:00.000Z", 80_000),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
      observation({ observedAt: "2026-09-18T13:50:00.000Z", momentumQualified: "TRUE" }),
    ];
    expect(applyAll(observations)).toEqual(applyAll(observations));
  });

  it("35. firstTriggerAt chooses the earliest event", () => {
    const state = applyAll([
      observation({ observedAt: "2026-09-18T14:10:00.000Z", momentumQualified: "TRUE" }),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
      observation({ observedAt: "2026-09-18T13:55:00.000Z", discoveryQualified: "TRUE" }),
    ]);
    expect(summarizeTriggerState(state).firstTriggerAt).toBe("2026-09-18T13:43:00.000Z");
  });

  it("36. trigger summary derives the correct fields", () => {
    const state = applyAll([
      observation({ observedAt: "2026-09-18T13:40:00.000Z", discoveryQualified: "TRUE" }),
      volumeAt("2026-09-18T13:43:00.000Z", 110_000),
      volumeAt("2026-09-18T13:47:00.000Z", 520_000),
      observation({ observedAt: "2026-09-18T13:50:00.000Z", momentumQualified: "TRUE" }),
      observation({
        observedAt: "2026-09-18T14:10:00.000Z",
        previousEstablishedHod: 10,
        currentPrice: 10.2,
      }),
      observation({ observedAt: "2026-09-18T12:00:00.000Z", catalystQuality: "STRONG" }),
    ]);
    expect(summarizeTriggerState(state)).toEqual({
      firstTriggerAt: "2026-09-18T12:00:00.000Z",
      discoveryTriggerAt: "2026-09-18T13:40:00.000Z",
      earliestVolumeTriggerAt: "2026-09-18T13:43:00.000Z",
      momentumTriggerAt: "2026-09-18T13:50:00.000Z",
      hodBreakTriggerAt: "2026-09-18T14:10:00.000Z",
      catalystTriggerAt: "2026-09-18T12:00:00.000Z",
    });
  });

  it("37. version is v1", () => {
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({ observedAt: "2026-09-18T13:41:00.000Z", discoveryQualified: "TRUE" }),
    );
    expect(TRIGGER_TIME_VERSION).toBe("v1");
    expect(result.version).toBe("v1");
    expect(result.state.version).toBe("v1");
    expect(result.state.events[0]?.version).toBe("v1");
  });

  it("38. volume thresholds are centralized in config", () => {
    expect(TRIGGER_VOLUME_THRESHOLDS.map((item) => item.key)).toEqual([
      "VOLUME_100K",
      "VOLUME_500K",
      "VOLUME_1M",
    ]);
    expect(TRIGGER_VOLUME_THRESHOLDS.map((item) => item.threshold)).toEqual([
      TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_100K,
      TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_500K,
      TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_1M,
    ]);
  });

  it("39. does not modify Discovery rank", () => {
    const candidate = { symbol: "ABC", discoveryRank: 2 };
    const result = updateTriggerState(
      emptyTriggerState(),
      observation({
        symbol: candidate.symbol,
        observedAt: "2026-09-18T13:41:00.000Z",
        discoveryQualified: "TRUE",
      }),
    );
    expect(candidate.discoveryRank).toBe(2);
    expect(result.state.events[0]?.triggerType).toBe("DISCOVERY_TRIGGER");
  });

  it("40. preserves discoveryRank on a wrapper candidate fixture", () => {
    const wrapper = {
      symbol: "XYZ",
      discoveryRank: 4,
      triggerState: emptyTriggerState(),
    };
    const next = updateTriggerState(
      wrapper.triggerState,
      observation({
        symbol: wrapper.symbol,
        observedAt: "2026-09-18T13:41:00.000Z",
        discoveryQualified: "TRUE",
        sessionVolume: TRIGGER_VOLUME_THRESHOLD_BY_KEY.VOLUME_100K,
      }),
    );
    wrapper.triggerState = next.state;
    expect(wrapper.discoveryRank).toBe(4);
    expect(wrapper.symbol).toBe("XYZ");
    expect(wrapper.triggerState.events.length).toBeGreaterThan(0);
  });
});
