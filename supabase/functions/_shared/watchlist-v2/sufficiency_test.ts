import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateSufficiency } from "./sufficiency.ts";

const base = {
  snapshot: "ok" as const, bars: "ok" as const, prior_close: "ok" as const,
  volume: "ok" as const, rvol: "ok" as const, events: "ok" as const,
  bar_count: 3, feed_delay_note: "provider feed is 15-minute delayed" as const,
  reason_codes: [],
};

Deno.test("evaluateSufficiency passes when all ok", () => {
  const r = evaluateSufficiency(base);
  assert(r.ok);
});

Deno.test("evaluateSufficiency snapshot missing fails first", () => {
  const r = evaluateSufficiency({ ...base, snapshot: "missing", prior_close: "missing", bars: "missing" });
  assert(!r.ok);
  assert(r.failure_reason!.includes("snapshot"));
});

Deno.test("evaluateSufficiency bars insufficient fails after snapshot/prior", () => {
  const r = evaluateSufficiency({ ...base, bars: "insufficient" });
  assert(!r.ok);
  assert(r.failure_reason!.toLowerCase().includes("bar"));
});

Deno.test("evaluateSufficiency snapshot stale is a hard failure", () => {
  const r = evaluateSufficiency({ ...base, snapshot: "stale" });
  assert(!r.ok);
});
