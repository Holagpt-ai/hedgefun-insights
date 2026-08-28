import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  AM_EVAL_END_MIN,
  AM_EVAL_START_MIN,
  etClock,
  isAmEvaluationInstant,
  isAmEvaluationWindow,
} from "./am-window.ts";

Deno.test("1. AM admits at 4:00 ET", () => {
  assertEquals(isAmEvaluationWindow(AM_EVAL_START_MIN), true);
  assertEquals(isAmEvaluationWindow(4 * 60), true);
});

Deno.test("2. AM admits through 9:30 ET", () => {
  assertEquals(isAmEvaluationWindow(AM_EVAL_END_MIN), true);
  assertEquals(isAmEvaluationWindow(9 * 60 + 30), true);
  assertEquals(isAmEvaluationWindow(9 * 60 + 15), true);
});

Deno.test("3. AM rejects before 4:00 / after 9:30", () => {
  assertEquals(isAmEvaluationWindow(4 * 60 - 1), false);
  assertEquals(isAmEvaluationWindow(3 * 60 + 59), false);
  assertEquals(isAmEvaluationWindow(9 * 60 + 31), false);
  assertEquals(isAmEvaluationWindow(10 * 60), false);
  assertEquals(isAmEvaluationWindow(0), false);
});

Deno.test("4. DST-safe ET gating (EDT and EST)", () => {
  // Friday 2026-08-28 is EDT (UTC-4)
  const edt400 = new Date("2026-08-28T08:00:00.000Z"); // 4:00 AM EDT
  const edt359 = new Date("2026-08-28T07:59:00.000Z"); // 3:59 AM EDT
  const edt930 = new Date("2026-08-28T13:30:00.000Z"); // 9:30 AM EDT
  const edt931 = new Date("2026-08-28T13:31:00.000Z"); // 9:31 AM EDT
  assertEquals(etClock(edt400).minutes, 240);
  assertEquals(etClock(edt400).date, "2026-08-28");
  assertEquals(isAmEvaluationInstant(edt400), true);
  assertEquals(isAmEvaluationInstant(edt359), false);
  assertEquals(isAmEvaluationInstant(edt930), true);
  assertEquals(isAmEvaluationInstant(edt931), false);

  // Thursday 2026-01-15 is EST (UTC-5)
  const est400 = new Date("2026-01-15T09:00:00.000Z"); // 4:00 AM EST
  const est359 = new Date("2026-01-15T08:59:00.000Z"); // 3:59 AM EST
  const est930 = new Date("2026-01-15T14:30:00.000Z"); // 9:30 AM EST
  const est931 = new Date("2026-01-15T14:31:00.000Z"); // 9:31 AM EST
  assertEquals(etClock(est400).minutes, 240);
  assertEquals(etClock(est400).date, "2026-01-15");
  assertEquals(isAmEvaluationInstant(est400), true);
  assertEquals(isAmEvaluationInstant(est359), false);
  assertEquals(isAmEvaluationInstant(est930), true);
  assertEquals(isAmEvaluationInstant(est931), false);
});

Deno.test("legacy 6:00–6:10 window is no longer the AM gate", () => {
  assertEquals(isAmEvaluationWindow(5 * 60), true); // 5:00 AM now admitted
  assertEquals(isAmEvaluationWindow(6 * 60), true);
  assertEquals(isAmEvaluationWindow(6 * 60 + 11), true); // previously rejected
});
