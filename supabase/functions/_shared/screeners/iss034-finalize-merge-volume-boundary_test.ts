/**
 * ISS-034 Nov 24–25: durable markers must reflect completed merge / volume-baseline
 * work, not stage enter. Markers do not prove CPU or a specific failing operation.
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  finalizeStageEnterExitWithMarkerAfterWork,
  persistFinalizeStageMarker,
} from "./sync-finalize-boundary-completion.ts";
import type { FinalizeStage } from "./sync-finalize-diagnostics.ts";
import { shouldPersistFinalizeStageMarker } from "./sync-finalize-diagnostics.ts";

type TraceEvent =
  | { kind: "enter"; stage: FinalizeStage }
  | { kind: "work"; stage: FinalizeStage }
  | { kind: "exit"; stage: FinalizeStage }
  | { kind: "persist"; stage: FinalizeStage };

function tracingStore(events: TraceEvent[]) {
  return {
    async noteFinalizeStage(params: {
      jobId: string;
      stage: FinalizeStage;
      nowMs: number;
    }): Promise<void> {
      events.push({ kind: "persist", stage: params.stage });
    },
  };
}

Deno.test("ISS-034: merge_selections marker persists only after selection work", async () => {
  const events: TraceEvent[] = [];
  const store = tracingStore(events);
  await finalizeStageEnterExitWithMarkerAfterWork({
    generationId: "gen-merge",
    syncRunId: "run-1",
    stage: "merge_selections",
    wallNowMs: 1,
    store,
    work: async () => {
      events.push({ kind: "work", stage: "merge_selections" });
      return { selected: 3 };
    },
    exitDetail: (r) => `selected=${r.selected}`,
  });
  const kinds = events.map((e) => `${e.kind}:${e.stage}`);
  assertEquals(kinds, [
    "work:merge_selections",
    "persist:merge_selections",
  ]);
});

Deno.test("ISS-034: load_volume_baselines marker persists only after load completes", async () => {
  const events: TraceEvent[] = [];
  const store = tracingStore(events);
  await finalizeStageEnterExitWithMarkerAfterWork({
    generationId: "gen-vol",
    syncRunId: "run-1",
    stage: "load_volume_baselines",
    wallNowMs: 2,
    store,
    work: async () => {
      events.push({ kind: "work", stage: "load_volume_baselines" });
      return new Map([["AAA", 1]]);
    },
    exitDetail: "loaded",
  });
  const kinds = events.map((e) => `${e.kind}:${e.stage}`);
  assertEquals(kinds, [
    "work:load_volume_baselines",
    "persist:load_volume_baselines",
  ]);
});

Deno.test("ISS-034: thrown work does not persist completion marker", async () => {
  const persisted: FinalizeStage[] = [];
  const store = {
    async noteFinalizeStage(params: {
      jobId: string;
      stage: FinalizeStage;
      nowMs: number;
    }): Promise<void> {
      persisted.push(params.stage);
    },
  };
  await assertRejects(
    () =>
      finalizeStageEnterExitWithMarkerAfterWork({
        generationId: "gen-fail",
        syncRunId: "run-1",
        stage: "merge_selections",
        wallNowMs: 3,
        store,
        work: () => {
          throw new TypeError("selection_failed");
        },
      }),
    TypeError,
  );
  assertEquals(persisted.length, 0);
});

Deno.test("ISS-034: marker persistence failure does not reject successful work", async () => {
  const store = {
    async noteFinalizeStage(): Promise<void> {
      throw new Error("db_write_failed");
    },
  };
  const value = await finalizeStageEnterExitWithMarkerAfterWork({
    generationId: "gen-ok",
    syncRunId: "run-1",
    stage: "load_volume_baselines",
    wallNowMs: 4,
    store,
    work: () => 42,
    exitDetail: "loaded",
  });
  assertEquals(value, 42);
});

Deno.test("ISS-034: load_volume_baselines is durable; preserve_check is not", () => {
  assertEquals(shouldPersistFinalizeStageMarker("merge_selections"), true);
  assertEquals(shouldPersistFinalizeStageMarker("load_volume_baselines"), true);
  assertEquals(shouldPersistFinalizeStageMarker("preserve_check"), false);
});

Deno.test("ISS-034: persistFinalizeStageMarker alone never logs stage enter", async () => {
  let persistCalls = 0;
  const store = {
    async noteFinalizeStage(): Promise<void> {
      persistCalls += 1;
    },
  };
  await persistFinalizeStageMarker(store, "gen", "merge_selections", 1);
  assertEquals(persistCalls, 1);
  await persistFinalizeStageMarker(store, "gen", "preserve_check", 1);
  assertEquals(persistCalls, 1);
});