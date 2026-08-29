import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { relayGenerator } from "./relay.ts";

function genRes(body: unknown, status: number): Response {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("available:false on HTTP 200 is a valid generator outcome", async () => {
  const res = await relayGenerator(
    genRes({
      available: false,
      reason: "source_stale",
      brief_type: "am",
      brief_date: "2026-08-28",
    }, 200),
    "am",
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.dispatched, false);
  assertEquals(body.reason, "source_stale");
  assertEquals(body.brief_type, "am");
  assertEquals(body.brief_date, "2026-08-28");
  assertEquals(body.error, undefined);
});

Deno.test("malformed generator body still fails", async () => {
  const notJson = await relayGenerator(genRes("not-json", 200), "am");
  assertEquals(notJson.status, 502);
  assertEquals((await notJson.json()).error, "invalid_generator_response");

  const missingFields = await relayGenerator(genRes({ cached: false }, 200), "am");
  assertEquals(missingFields.status, 502);
  assertEquals((await missingFields.json()).error, "invalid_generator_response");
});

Deno.test("generator non-2xx stays a true failure", async () => {
  const auth = await relayGenerator(genRes({ error: "Unauthorized" }, 401), "am");
  assertEquals(auth.status, 500);
  assertEquals((await auth.json()).error, "internal_authentication_failure");

  const bad = await relayGenerator(genRes({ error: "Invalid briefType" }, 400), "am");
  assertEquals(bad.status, 500);
  assertEquals((await bad.json()).error, "invalid_internal_schedule");

  const provider = await relayGenerator(genRes({ error: "Upstream generation failed" }, 502), "am");
  assertEquals(provider.status, 502);
  assertEquals((await provider.json()).error, "generation_provider_failure");

  const source = await relayGenerator(
    genRes({ available: false, reason: "source_stale" }, 503),
    "am",
  );
  assertEquals(source.status, 503);
  assertEquals((await source.json()).error, "generation_source_unavailable");
});

Deno.test("successful generated brief still dispatches", async () => {
  const res = await relayGenerator(
    genRes({
      id: "row-1",
      brief_type: "am",
      brief_date: "2026-08-28",
      cached: false,
    }, 200),
    "am",
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.dispatched, true);
  assertEquals(body.brief_type, "am");
  assertEquals(body.brief_date, "2026-08-28");
});
