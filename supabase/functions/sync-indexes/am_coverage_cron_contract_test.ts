import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

const COVERAGE_REL =
  "../../migrations/20260829214800_sync_indexes_am_brief_coverage_v1.sql";
const AM_DISPATCH_REL =
  "../../migrations/20260828170000_brief_dispatch_am_v2_eval.sql";
const ORIGINAL_INDEX_REL =
  "../../migrations/20260712202500_b329a53f-747d-4481-a92b-b81c1f49e330.sql";
const CATCHUP_CADENCE_REL =
  "../../migrations/20260829120300_screener_52w_baseline_catchup_cadence_v1.sql";

const FRESHNESS_MS = 10 * 60 * 1000;
const AM_DISPATCH_FIRST_UTC_MIN = 8 * 60; // 08:00 UTC

async function load(rel: string): Promise<string> {
  const raw = await Deno.readTextFile(new URL(rel, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function firstTickUtcMinutes(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  assertEquals(parts.length, 5, `unexpected cron: ${cron}`);
  const minuteField = parts[0];
  const hourField = parts[1];
  const weekdayField = parts[4];
  assertEquals(weekdayField, "1-5");
  const startHour = parseInt(hourField.split("-")[0], 10);
  let startMinute = 0;
  if (minuteField.startsWith("*/")) {
    startMinute = 0;
  } else {
    startMinute = parseInt(minuteField.split("-")[0], 10);
  }
  return startHour * 60 + startMinute;
}

Deno.test("original weekday sync-indexes began at 09:00 UTC", async () => {
  const sql = await load(ORIGINAL_INDEX_REL);
  assert(sql.includes("'sync-indexes-2min', '*/2 9-23 * * 1-5'"));
});

Deno.test("coverage migration starts weekday sync-indexes before AM dispatch", async () => {
  const sql = await load(COVERAGE_REL);
  assert(sql.includes("cron.unschedule('sync-indexes-2min')"));
  assert(sql.includes("'sync-indexes-2min'"));
  assert(sql.includes("'*/2 7-23 * * 1-5'"));
  assertFalse(sql.includes("'*/2 9-23 * * 1-5'"));
  assertFalse(/cron\.(schedule|unschedule)\(\s*'sync-indexes-2min-early'/.test(sql));
  const schedules = [...sql.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)].map((m) => m[1]);
  assertEquals(schedules, ["sync-indexes-2min"]);
  const first = firstTickUtcMinutes("*/2 7-23 * * 1-5");
  assertEquals(first, 7 * 60);
  assert(first < AM_DISPATCH_FIRST_UTC_MIN, "must fire before 08:00 UTC");
  const lastBeforeDispatch = 7 * 60 + 58; // 07:58
  const ageAtDispatchMs = (AM_DISPATCH_FIRST_UTC_MIN - lastBeforeDispatch) * 60 * 1000;
  assertEquals(ageAtDispatchMs, 2 * 60 * 1000);
  assert(ageAtDispatchMs <= FRESHNESS_MS);
});

Deno.test("AM brief dispatcher schedule is unchanged", async () => {
  const sql = await load(AM_DISPATCH_REL);
  assert(sql.includes("'*/15 8-14 * * 1-5'"));
  const coverage = await load(COVERAGE_REL);
  assertFalse(/cron\.(schedule|unschedule)\(\s*'brief-dispatch-am'/.test(coverage));
  assertFalse(/cron\.(schedule|unschedule)\(\s*'brief-dispatch-pm'/.test(coverage));
});

Deno.test("coverage migration does not touch 52w cadence", async () => {
  const sql = await load(COVERAGE_REL);
  assertFalse(sql.includes("sync-screener-52w"));
  assertFalse(sql.includes("screener_52w"));
  const cadence = await load(CATCHUP_CADENCE_REL);
  assert(cadence.includes("sync-screener-52w-baselines-after-close"));
  assert(cadence.includes("sync-screener-52w-baselines-overnight"));
});
