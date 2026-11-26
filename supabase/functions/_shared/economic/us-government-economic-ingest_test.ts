import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseBlsReleaseScheduleHtml,
  parseFedMonthlyNewsEventsHtml,
  summarizeUsGovernmentSyncOutcome,
  type UsGovernmentIngestResult,
} from "./us-government-economic-ingest.ts";

const fedDec2026Html = await Deno.readTextFile(
  new URL("./fixtures/fed-2026-december.html", import.meta.url),
);
const blsOfficialHtml = await Deno.readTextFile(
  new URL("./fixtures/bls-release-list-official.html", import.meta.url),
);

Deno.test("parses official BLS release-list rows in range", () => {
  const rows = parseBlsReleaseScheduleHtml(blsOfficialHtml, "2026-11-01", "2026-12-31");
  const employmentDec = rows.find(
    (r) => r.event_name === "Employment Situation" && r.event_date === "2026-12-04",
  );
  const cpiDec = rows.find((r) => r.event_name === "Consumer Price Index" && r.event_date === "2026-12-10");
  assertEquals(employmentDec?.event_time, "08:30:00");
  assertEquals(cpiDec?.event_time, "08:30:00");
  assertEquals(rows.some((r) => r.event_date === "2026-11-06" && r.event_name === "Employment Situation"), true);
  assertEquals(
    rows.some((r) => r.event_name === "Employment Situation" && r.event_date === "2026-11-26"),
    false,
  );
});

Deno.test("FOMC statement uses announcement day Dec 9 14:00 ET for Dec 8-9 meeting", () => {
  const rows = parseFedMonthlyNewsEventsHtml(fedDec2026Html, "2026-12-01", "2026-12-31");
  const statement = rows.filter((r) => r.event_name === "FOMC Statement");
  assertEquals(statement.length, 1);
  assertEquals(statement[0].event_date, "2026-12-09");
  assertEquals(statement[0].event_time, "14:00:00");
  assertEquals(statement.some((r) => r.event_date === "2026-12-08"), false);
});

Deno.test("Fed monthly parser ignores unrelated December dates outside FOMC meeting rows", () => {
  const noisy = `${fedDec2026Html}<p>Hearing on Tuesday, December 8, 2026</p>`;
  const rows = parseFedMonthlyNewsEventsHtml(noisy, "2026-12-01", "2026-12-31");
  assertEquals(rows.filter((r) => r.event_date === "2026-12-08").length, 0);
});

Deno.test("US government sync outcome — all sources failed is not ok", () => {
  const gov: UsGovernmentIngestResult = {
    rows: [],
    sourcesSucceeded: [],
    sourcesFailed: ["bls_schedule", "federal_reserve_fomc"],
    errors: ["bls_http_403", "fed_http_500"],
    partialCoverage: false,
    allSourcesFailed: true,
  };
  const outcome = summarizeUsGovernmentSyncOutcome(gov);
  assertEquals(outcome.ok, false);
  assertEquals(outcome.shouldPersistSuccessMetadata, false);
});

Deno.test("US government sync outcome — partial coverage", () => {
  const gov: UsGovernmentIngestResult = {
    rows: [],
    sourcesSucceeded: ["bls_schedule"],
    sourcesFailed: ["federal_reserve_fomc"],
    errors: ["fed_http_500"],
    partialCoverage: true,
    allSourcesFailed: false,
  };
  const outcome = summarizeUsGovernmentSyncOutcome(gov);
  assertEquals(outcome.ok, true);
  assertEquals(outcome.partialCoverage, true);
  assertEquals(outcome.shouldPersistSuccessMetadata, true);
});