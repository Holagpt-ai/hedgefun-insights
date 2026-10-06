import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyToday, etParts, extractEtOffset, inferLastCompletedSessionDate, isWeekend,
  resolveSession, resolveAnalysisSession, watchlistSessionBucket,
} from "./session.ts";

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

Deno.test("resolveAnalysisSession uses last completed session on weekend", async () => {
  const r = await resolveAnalysisSession(new Date("2026-09-26T17:00:00Z"), {
    fetchNow: () => Promise.resolve({ serverTime: "2026-09-26T13:00:00-04:00" }),
    fetchUpcoming: () => Promise.resolve([]),
  });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.session.presentation, "last_completed");
    assertEquals(r.session.session_date, "2026-09-25");
    assert(r.session.session_display_label.includes("Sep 25"));
  }
});

Deno.test("inferLastCompletedSessionDate skips weekends, holidays, and pre-04:00", () => {
  assertEquals(inferLastCompletedSessionDate(new Date("2026-10-03T16:00:00Z")), "2026-10-02");
  assertEquals(inferLastCompletedSessionDate(new Date("2026-10-04T18:00:00Z")), "2026-10-02");
  assertEquals(inferLastCompletedSessionDate(new Date("2026-10-05T07:00:00Z")), "2026-10-02");
  assertEquals(inferLastCompletedSessionDate(new Date("2026-09-07T18:00:00Z")), "2026-09-04");
  assertEquals(inferLastCompletedSessionDate(new Date("2026-09-08T07:00:00Z")), "2026-09-04");
  assertEquals(inferLastCompletedSessionDate(new Date("2026-10-05T08:15:00Z")), "2026-10-05");
  assertEquals(inferLastCompletedSessionDate(new Date("2026-10-06T00:30:00Z")), "2026-10-05");
});

Deno.test("resolveAnalysisSession uses Friday when Monday is a holiday", async () => {
  let called = false;
  const r = await resolveAnalysisSession(new Date("2026-09-07T18:00:00Z"), {
    fetchNow: () => {
      called = true;
      return Promise.resolve({});
    },
    fetchUpcoming: () => Promise.resolve([]),
  });
  assertEquals(called, false);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.session.presentation, "last_completed");
    assertEquals(r.session.session_date, "2026-09-04");
  }
});

Deno.test("watchlist minute buckets do not double-count 09:30 or 16:00", () => {
  assertEquals(watchlistSessionBucket(3 * 60 + 59), "closed");
  assertEquals(watchlistSessionBucket(4 * 60), "premarket");
  assertEquals(watchlistSessionBucket(9 * 60 + 29), "premarket");
  assertEquals(watchlistSessionBucket(9 * 60 + 30), "rth");
  assertEquals(watchlistSessionBucket(15 * 60 + 59), "rth");
  assertEquals(watchlistSessionBucket(16 * 60), "postclose");
  assertEquals(watchlistSessionBucket(19 * 60 + 59), "postclose");
  assertEquals(watchlistSessionBucket(20 * 60), "closed");
});

Deno.test("static early close is postclose after 13:00 ET when the provider lists no exception", async () => {
  const r = await resolveSession(new Date("2026-11-27T19:00:00Z"), {
    fetchNow: () => Promise.resolve({ serverTime: "2026-11-27T14:00:00-05:00" }),
    fetchUpcoming: () => Promise.resolve([]),
  });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.session_type, "postclose");
    assertEquals(r.early_close_minutes, 780);
    assertEquals(r.session_date, "2026-11-27");
  }
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
