// Contract: alert CHECK list matches SCANNER_EVENT_TYPES. Does not execute SQL.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SCANNER_EVENT_TYPES } from "../radar-v22/scanner-events.ts";

const MIGRATION_REL =
  "../../../migrations/20261122160000_scanner_intelligence_alerts_event_types_v1.sql";

Deno.test("alert event-type check matches the eight scanner event types", async () => {
  const sql = (await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url)))
    .replaceAll("\r\n", "\n");
  const listed = [...sql.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  assertEquals(listed, [...SCANNER_EVENT_TYPES]);
  assertEquals(listed.length, 8);
  assertEquals(listed.includes("VWAP_LOSS"), true);
  assertEquals(listed.includes("VOLUME_ACCELERATION"), false);
});
