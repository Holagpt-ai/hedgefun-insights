import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateGappersEvidence } from "./evaluation-evidence.ts";
import { mapTabRows, type GenerationMeta } from "./rows.ts";
import type { PolygonTicker } from "./selection.ts";
import {
  resolveObservationSessionKind,
  resolveVerifiedObservationMs,
  sessionQualificationVolume,
} from "./session-volume.ts";

/** 2026-10-28 EDT (UTC-4). */
function etMs(hour: number, minute: number): number {
  return Date.UTC(2026, 9, 28, hour + 4, minute, 0, 0);
}

function snapshot(partial: {
  minT: number;
  updated?: number;
  dayV: number;
  minAv: number;
}): PolygonTicker {
  const updatedNs = (partial.updated ?? partial.minT) * 1_000_000;
  return {
    ticker: "TEST",
    updated: updatedNs,
    day: { v: partial.dayV, c: 100 },
    prevDay: { c: 99, v: 1_000_000 },
    min: { av: partial.minAv, v: 1_000, t: partial.minT },
    lastTrade: { p: 100.5, t: partial.minT },
  };
}

const SERVER_917 = etMs(9, 17);
const OBS_902 = etMs(9, 2);
const SERVER_935 = etMs(9, 35);
const OBS_920 = etMs(9, 20);
const SERVER_946 = etMs(9, 46);
const OBS_931 = etMs(9, 31);
const SERVER_405PM = etMs(16, 5);
const OBS_350PM = etMs(15, 50);
const SERVER_420PM = etMs(16, 20);
const OBS_405PM = etMs(16, 5);

Deno.test("boundary: 9:17 server / 9:02 provider uses premarket min.av", () => {
  const t = snapshot({ minT: OBS_902, dayV: 0, minAv: 500_000 });
  assertEquals(resolveObservationSessionKind(t, SERVER_917), "pre-market");
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_917 }),
    500_000,
  );
});

Deno.test("boundary: 9:35 server / 9:20 provider stays premarket volume", () => {
  const t = snapshot({ minT: OBS_920, dayV: 0, minAv: 800_000 });
  assertEquals(resolveObservationSessionKind(t, SERVER_935), "pre-market");
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_935 }),
    800_000,
  );
});

Deno.test("boundary: 9:46 server / 9:31 provider uses regular day.v", () => {
  const t = snapshot({ minT: OBS_931, dayV: 2_000_000, minAv: 2_100_000 });
  assertEquals(resolveObservationSessionKind(t, SERVER_946), "market");
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_946 }),
    2_000_000,
  );
});

Deno.test("boundary: 4:05 PM server / 3:50 PM provider uses regular day.v", () => {
  const t = snapshot({ minT: OBS_350PM, dayV: 40_000_000, minAv: 40_100_000 });
  assertEquals(resolveObservationSessionKind(t, SERVER_405PM), "market");
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_405PM }),
    40_000_000,
  );
});

Deno.test("boundary: 4:20 PM server / 4:05 PM provider uses after-hours increment", () => {
  const t = snapshot({ minT: OBS_405PM, dayV: 40_000_000, minAv: 40_250_000 });
  assertEquals(resolveObservationSessionKind(t, SERVER_420PM), "after-hours");
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_420PM }),
    250_000,
  );
});

Deno.test("boundary: prior surveillance-day observation yields unavailable volume", () => {
  const priorDayObs = Date.parse("2026-10-27T13:30:00.000Z");
  const t = snapshot({ minT: priorDayObs, dayV: 0, minAv: 900_000 });
  assertEquals(resolveVerifiedObservationMs(t, SERVER_917), priorDayObs);
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_917 }),
    null,
  );
});

Deno.test("boundary: contradictory min.t and updated sessions are unavailable", () => {
  const t: PolygonTicker = {
    ticker: "X",
    updated: OBS_931 * 1_000_000,
    day: { v: 0 },
    min: { av: 100_000, t: OBS_902 },
  };
  assertEquals(resolveVerifiedObservationMs(t, SERVER_935), null);
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_935 }),
    null,
  );
});

Deno.test("boundary: missing timestamps fail closed on extended volume", () => {
  const t: PolygonTicker = { ticker: "X", day: { v: 0 }, min: { av: 50_000 } };
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: SERVER_917 }),
    null,
  );
});

Deno.test("boundary: persisted row matches observation-session volume", () => {
  const t = snapshot({ minT: OBS_920, dayV: 0, minAv: 600_000 });
  const meta: GenerationMeta = {
    syncedAt: new Date(SERVER_935).toISOString(),
    syncRunId: "11111111-2222-3333-4444-555555555555",
    nowMs: SERVER_935,
    extendedSession: true,
  };
  const [row] = mapTabRows("gappers", [t], (s) => s, meta);
  assertEquals(row.volume, 600_000);
  const evidence = evaluateGappersEvidence([t], [t], undefined, true, SERVER_935);
  assertEquals(evidence.volume_positive_count, 1);
});
