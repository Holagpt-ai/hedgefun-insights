import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyFinalizeError,
  formatFinalizeStageMarker,
  isFinalizeStageMarker,
  mergePlatformKillWithFinalizeStage,
  sanitizeErrorToCode,
} from "./sync-finalize-diagnostics.ts";

Deno.test("diagnostics: maps TypeError without leaking message", () => {
  const err = new TypeError(
    "postgres://user:secret@host/db failed select * from stocks",
  );
  const c = classifyFinalizeError(err, "atomic_publish");
  assertEquals(c.code, "type_error");
  assertEquals(JSON.stringify(c).includes("secret"), false);
  assertEquals(JSON.stringify(c).includes("postgres"), false);
});

Deno.test("diagnostics: unknown throwables become unclassified", () => {
  assertEquals(sanitizeErrorToCode("raw string"), "unclassified");
});

Deno.test("diagnostics: http_546 keeps the last bounded finalize stage", () => {
  const marker = formatFinalizeStageMarker("atomic_publish");
  assertEquals(isFinalizeStageMarker(marker), true);
  assertEquals(
    mergePlatformKillWithFinalizeStage("http_546", marker),
    "http_546:finalize_stage:atomic_publish",
  );
  assertEquals(mergePlatformKillWithFinalizeStage("http_546", "http_409"), "http_546");
  assertEquals(
    mergePlatformKillWithFinalizeStage("finalize_owner_conflict", marker),
    "finalize_owner_conflict",
  );
  const leaked = "finalize_stage:" + "AAPL,".repeat(40);
  assertEquals(isFinalizeStageMarker(leaked), false);
});
