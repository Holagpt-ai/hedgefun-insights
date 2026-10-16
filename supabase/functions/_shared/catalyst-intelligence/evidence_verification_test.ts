import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyEvidence } from "./evidence.ts";
import { schedulesMateriallyConflict } from "./evidence-schedule-conflict.ts";

Deno.test("verifyEvidence returns CONFLICTING when evidence rows conflict", () => {
  const state = verifyEvidence([
    {
      evidenceTier: "TIER_1_PRIMARY",
      authorityKey: "sec",
      conflict: true,
    },
  ]);
  assertEquals(state, "CONFLICTING");
});

Deno.test("schedulesMateriallyConflict detects distant schedule disagreement", () => {
  assertEquals(
    schedulesMateriallyConflict("2026-01-10T15:00:00.000Z", "2026-03-01T15:00:00.000Z"),
    true,
  );
  assertEquals(
    schedulesMateriallyConflict("2026-01-10T15:00:00.000Z", "2026-01-11T15:00:00.000Z"),
    false,
  );
});
