import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyFinalizeError,
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
