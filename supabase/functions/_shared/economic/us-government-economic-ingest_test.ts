import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseBlsReleaseScheduleHtml,
  parseFedFomcCalendarHtml,
} from "./us-government-economic-ingest.ts";

Deno.test("parses BLS schedule rows in range", () => {
  const html = `
    <td>November 26, 2026</td><td>08:30 am</td></tr><tr><td>Consumer Price Index</td>
    <td>December 05, 2026</td><td>08:30 am</td></tr><tr><td>Employment Situation</td>
  `;
  const rows = parseBlsReleaseScheduleHtml(html, "2026-11-01", "2026-12-31");
  assertEquals(rows.length >= 1, true);
  assertEquals(rows[0].consensus_estimate, null);
  assertEquals(rows[0].actual_value, null);
});

Deno.test("parses FOMC meeting dates", () => {
  const html = "<p>Meeting - January 28-29</p><p>Meeting - March 18-19</p>";
  const rows = parseFedFomcCalendarHtml(html, "2026-01-01", "2026-12-31", 2026);
  assertEquals(rows.some((r) => r.event_name === "FOMC Statement"), true);
});