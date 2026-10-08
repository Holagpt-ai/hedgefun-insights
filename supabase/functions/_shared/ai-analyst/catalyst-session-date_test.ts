import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { catalystSessionDateFromQuestion } from "./catalyst-session-date.ts";

Deno.test("historical catalyst question uses the named session date", () => {
  const now = new Date("2026-10-08T16:00:00.000Z");
  assertEquals(
    catalystSessionDateFromQuestion("Why was MRVL up on October 6, 2026?", now),
    "2026-10-06",
  );
  assertEquals(
    catalystSessionDateFromQuestion("What happened to MRVL on 2026-10-06?", now),
    "2026-10-06",
  );
});

Deno.test("questions without a calendar date stay on the provided clock date", () => {
  const now = new Date("2026-10-08T16:00:00.000Z");
  assertEquals(catalystSessionDateFromQuestion("Why is MRVL up today?", now), "2026-10-08");
});
