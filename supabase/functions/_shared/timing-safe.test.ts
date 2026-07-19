import { strictEqual } from "node:assert/strict";
import { timingSafeMatch, timingSafeMatchAny } from "./timing-safe.ts";

Deno.test("1. exact match returns true", async () => {
  strictEqual(await timingSafeMatch("s3cret-value-abc", "s3cret-value-abc"), true);
});

Deno.test("2. mismatch returns false (same length and different length)", async () => {
  strictEqual(await timingSafeMatch("s3cret-value-abc", "s3cret-value-abd"), false);
  strictEqual(await timingSafeMatch("short", "a-much-longer-configured-secret"), false);
});

Deno.test("3. empty configured secret returns false", async () => {
  strictEqual(await timingSafeMatch("anything", ""), false);
  strictEqual(await timingSafeMatch("anything", undefined), false);
  strictEqual(await timingSafeMatch("anything", null), false);
});

Deno.test("4. empty presented value returns false against a real secret", async () => {
  strictEqual(await timingSafeMatch("", "configured-secret"), false);
});

Deno.test("5. Unicode inputs compare correctly", async () => {
  strictEqual(await timingSafeMatch("sécrèt-🔑-値", "sécrèt-🔑-値"), true);
  strictEqual(await timingSafeMatch("sécrèt-🔑-値", "sécrèt-🔑-值"), false);
});

Deno.test("6. canonical match via matchAny returns true", async () => {
  strictEqual(await timingSafeMatchAny("canonical-v", ["canonical-v", "next-v"]), true);
});

Deno.test("7. NEXT match via matchAny returns true", async () => {
  strictEqual(await timingSafeMatchAny("next-v", ["canonical-v", "next-v"]), true);
});

Deno.test("8. neither match returns false", async () => {
  strictEqual(await timingSafeMatchAny("wrong-v", ["canonical-v", "next-v"]), false);
});

Deno.test("9. all-empty candidates return false, including empty presented", async () => {
  strictEqual(await timingSafeMatchAny("anything", ["", undefined, null]), false);
  strictEqual(await timingSafeMatchAny("", ["", ""]), false);
});
