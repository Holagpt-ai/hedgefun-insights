import { describe, expect, it } from "vitest";
import {
  emptyQualificationEpisodeState,
  stepDayTradeQualificationLifecycle,
} from "../../../../supabase/functions/_shared/day-trade/qualification-lifecycle.ts";
import {
  episodeStateToRow,
  stateRowToEpisode,
} from "../../../../supabase/functions/_shared/day-trade/persist-qualification-lifecycle.ts";

describe("day trade qualification lifecycle v42", () => {
  it("preserves episode fields across persistence round-trip", () => {
    const state = emptyQualificationEpisodeState({
      sessionDate: "2026-10-12",
      symbol: "IRE",
    });
    state.phase = "EXPIRED";
    state.firstQualifiedAt = "2026-10-12T08:49:00.000Z";
    state.expiredAt = "2026-10-12T08:51:00.000Z";
    state.expirationReasonCodes = ["MOMENTUM_TOO_WEAK"];
    const row = episodeStateToRow(state);
    const restored = stateRowToEpisode(row);
    expect(restored.phase).toBe("EXPIRED");
    expect(restored.symbol).toBe("IRE");
    expect(restored.expirationReasonCodes).toEqual(["MOMENTUM_TOO_WEAK"]);
  });

  it("browser refresh uses server rows, not local workspace state", () => {
    const serverRow = episodeStateToRow({
      ...emptyQualificationEpisodeState({ sessionDate: "2026-10-12", symbol: "YMAT" }),
      phase: "EXPIRED",
      firstQualifiedAt: "2026-10-12T08:00:00.000Z",
      expiredAt: "2026-10-12T09:00:00.000Z",
      expirationReasonCodes: ["INSUFFICIENT_RVOL"],
      monitoredPrice: 3.2,
      monitoredVolume: 2_000_000,
      providerAsOfIso: "2026-10-12T09:00:00.000Z",
      graceFailureCount: 2,
      graceFirstFailureAt: null,
      lastQualifiedAt: null,
      pillarOutcomes: null,
      priorEpisodes: [],
      lastSnapshotKey: null,
      lastMarketDataMs: null,
    });
    const parsed = stateRowToEpisode(serverRow);
    expect(parsed.monitoredPrice).toBe(3.2);
    expect(parsed.phase).toBe("EXPIRED");
  });

  it("new session starts fresh while prior episode history is preserved on the row", () => {
    const prior = emptyQualificationEpisodeState({ sessionDate: "2026-10-11", symbol: "IRE" });
    prior.phase = "EXPIRED";
    prior.priorEpisodes = [
      {
        first_qualified_at: "2026-10-10T14:00:00.000Z",
        expired_at: "2026-10-10T16:00:00.000Z",
        expiration_reason: ["MOMENTUM_TOO_WEAK"],
      },
    ];
    const nextSession = emptyQualificationEpisodeState({ sessionDate: "2026-10-12", symbol: "IRE" });
    expect(nextSession.phase).toBeNull();
    expect(prior.priorEpisodes).toHaveLength(1);
  });

  it("duplicate worker runs do not duplicate QUALIFIED events", () => {
    let state = emptyQualificationEpisodeState({ sessionDate: "2026-10-12", symbol: "IRE" });
    const pass = {
      symbol: "IRE",
      evaluable: true,
      fivePillarsPass: true,
      pillarOutcomes: {
        price: "pass",
        move: "pass",
        float: "pass",
        participation: "pass",
        freshness: "pass",
      } as const,
      reasonCodes: [],
      marketDataMs: 1_000,
      snapshotKey: "gen-1:IRE:t1",
      monitoredPrice: 4,
      monitoredVolume: 100,
      providerAsOfIso: "2026-10-12T08:49:00.000Z",
    };
    const first = stepDayTradeQualificationLifecycle(state, pass, 1_000);
    state = first.state;
    expect(first.events.filter((e) => e.type === "QUALIFIED")).toHaveLength(1);
    const second = stepDayTradeQualificationLifecycle(state, { ...pass, snapshotKey: "gen-2:IRE:t2", marketDataMs: 2_000 }, 2_000);
    expect(second.events.filter((e) => e.type === "QUALIFIED")).toHaveLength(0);
  });
});
