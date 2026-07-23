import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyToday, etParts, extractEtOffset, isWeekend, resolveSession } from "./session.ts";

Deno.test("etParts extracts ET weekday+date", () => {
  // 2026-07-23 15:00 UTC = 11:00 ET (EDT summer)
  const p = etParts(new Date("2026-07-23T15:00:00Z"));
  assertEquals(p.date, "2026-07-23");
  assertEquals(p.hour, 11);
});

Deno.test("isWeekend", () => {
  assert(isWeekend("Sat"));
  assert(isWeekend("Sun"));
  assert(!isWeekend("Mon"));
});

Deno.test("extractEtOffset accepts EDT/EST", () => {
  assertEquals(extractEtOffset("2026-07-23T11:00:00-04:00"), "-04:00");
  assertEquals(extractEtOffset("2026-01-15T11:00:00-05:00"), "-05:00");
  assertEquals(extractEtOffset("2026-07-23T11:00:00Z"), null);
});

Deno.test("classifyToday conflict when only one exchange listed", () => {
  const r = classifyToday([{ exchange: "NYSE", status: "closed", date: "2026-07-23" }], "2026-07-23");
  assertEquals(r.kind, "conflict");
});

Deno.test("classifyToday normal when nothing listed", () => {
  assertEquals(classifyToday([], "2026-07-23").kind, "normal");
});

Deno.test("classifyToday full_holiday when both closed", () => {
  const r = classifyToday(
    [
      { exchange: "NYSE", status: "closed", date: "2026-07-23" },
      { exchange: "NASDAQ", status: "closed", date: "2026-07-23" },
    ],
    "2026-07-23",
  );
  assertEquals(r.kind, "full_holiday");
});

Deno.test("resolveSession non-trading on weekend", async () => {
  const r = await resolveSession(new Date("2026-07-25T15:00:00Z"), {
    fetchNow: () => Promise.resolve({}), fetchUpcoming: () => Promise.resolve([]),
  });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "NON_TRADING_DAY");
});

Deno.test("resolveSession outside_session_window before 04:00 ET", async () => {
  // 03:30 ET = 07:30Z (EDT)
  const r = await resolveSession(new Date("2026-07-23T07:30:00Z"), {
    fetchNow: () => Promise.resolve({}), fetchUpcoming: () => Promise.resolve([]),
  });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "OUTSIDE_SESSION_WINDOW");
});

Deno.test("resolveSession session_unresolved on missing offset", async () => {
  const r = await resolveSession(new Date("2026-07-23T15:00:00Z"), {
    fetchNow: () => Promise.resolve({ serverTime: "invalid" }),
    fetchUpcoming: () => Promise.resolve([]),
  });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "SESSION_UNRESOLVED");
});

Deno.test("resolveSession picks rth on normal weekday", async () => {
  // 11:00 ET
  const r = await resolveSession(new Date("2026-07-23T15:00:00Z"), {
    fetchNow: () => Promise.resolve({ serverTime: "2026-07-23T11:00:00-04:00" }),
    fetchUpcoming: () => Promise.resolve([]),
  });
  assert(r.ok);
  if (r.ok) assertEquals(r.session_type, "rth");
});
