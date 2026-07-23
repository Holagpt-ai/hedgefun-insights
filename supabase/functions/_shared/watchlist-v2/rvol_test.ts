import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeRvol } from "./rvol.ts";

const curve = [
  { m: 0, cum: 0 },
  { m: 30, cum: 100 },
  { m: 60, cum: 250 },
  { m: 120, cum: 500 },
  { m: 240, cum: 900 },
  { m: 389, cum: 1500 },
];
const baseline = { baseline_date: "2026-07-22", curve, sessions_used: 15 };

Deno.test("computeRvol computes ok with linear interp", () => {
  // etNow=600 → mNow=30 → expected 100. Cum=200 → 2.0
  const r = computeRvol("rth", "2026-07-23", 600, 200, baseline);
  assertEquals(r.quality, "ok");
  assertEquals(r.rvol, 2);
  assertEquals(r.rvol_class, "elevated");
});

Deno.test("computeRvol classifies unusual >= 3", () => {
  const r = computeRvol("rth", "2026-07-23", 600, 400, baseline);
  assertEquals(r.rvol_class, "unusual");
});

Deno.test("computeRvol not applicable for premarket", () => {
  const r = computeRvol("premarket", "2026-07-23", 500, 100, baseline);
  assertEquals(r.quality, "not_applicable_session");
  assertEquals(r.rvol, null);
});

Deno.test("computeRvol no_baseline when null", () => {
  const r = computeRvol("rth", "2026-07-23", 600, 100, null);
  assertEquals(r.quality, "no_baseline");
});

Deno.test("computeRvol baseline_incompatible if too old", () => {
  const r = computeRvol("rth", "2026-07-23", 600, 100, { ...baseline, baseline_date: "2026-07-01" });
  assertEquals(r.quality, "baseline_incompatible");
});

Deno.test("computeRvol baseline_invalid on bad sessions_used", () => {
  const r = computeRvol("rth", "2026-07-23", 600, 100, { ...baseline, sessions_used: 5 });
  assertEquals(r.quality, "baseline_invalid");
});
