import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_LIVE_REACTION_WINDOWS,
  parseReactionWindows,
  reactionWindowsDueForEvent,
} from "./reaction-window-schedule.ts";
import type { CanonicalEvent } from "./types.ts";

function eventAt(iso: string): CanonicalEvent {
  return {
    id: crypto.randomUUID(),
    canonicalKey: "test",
    title: "Test",
    summary: null,
    announcementSummary: null,
    eventType: "EARNINGS",
    eventSubtype: null,
    lifecycle: "discovered",
    catalystState: "IMMEDIATE",
    firstDiscoveredAt: iso,
    sourcePublishedAt: iso,
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduledDate: null,
    announcementAt: iso,
    effectiveAt: null,
    timingBucket: "unknown",
    verificationState: "VERIFIED_PRIMARY",
    evidenceConfidence: 0.8,
    materiality: 0.5,
    timingUrgency: 0.5,
    reactionScore: null,
    priorityScore: 50,
    attributionConfidence: 0.9,
    distributionStatus: "ready",
    lifecycleLog: [],
    scoreComponents: {},
  };
}

Deno.test("parseReactionWindows accepts m5 m15 m30", () => {
  assertEquals(parseReactionWindows(["m5", "m15", "m30"]), ["m5", "m15", "m30"]);
  assertEquals(parseReactionWindows(null), null);
});

Deno.test("DEFAULT_LIVE_REACTION_WINDOWS is m5 m15 m30", () => {
  assertEquals([...DEFAULT_LIVE_REACTION_WINDOWS], ["m5", "m15", "m30"]);
});

Deno.test("reactionWindowsDueForEvent gates by minimum age", () => {
  const ref = "2026-10-01T15:00:00.000Z";
  const event = eventAt(ref);
  assertEquals(reactionWindowsDueForEvent(event, new Date("2026-10-01T15:04:59.000Z"), ["m5", "m15"]), []);
  assertEquals(reactionWindowsDueForEvent(event, new Date("2026-10-01T15:05:00.000Z"), ["m5", "m15"]), ["m5"]);
  assertEquals(
    reactionWindowsDueForEvent(event, new Date("2026-10-01T15:30:00.000Z"), ["m5", "m15", "m30"]),
    ["m5", "m15", "m30"],
  );
});
