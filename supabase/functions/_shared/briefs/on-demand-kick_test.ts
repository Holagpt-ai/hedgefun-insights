import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BRIEF_KICK_COOLDOWN_MS,
  maybeKickBriefGeneration,
  resetBriefKickCooldownForTests,
  shouldKickBriefGeneration,
} from "./on-demand-kick.ts";
import { stateFromEvidenceReason } from "./generation-state.ts";

Deno.test("shouldKickBriefGeneration allows AM read inside evaluation window", () => {
  resetBriefKickCooldownForTests();
  const gate = shouldKickBriefGeneration({
    briefType: "am",
    briefDate: "2026-10-06",
    nowMinutesEt: 5 * 60,
    hasValidBrief: false,
    state: null,
    nowMs: 1_000_000,
  });
  assertEquals(gate.allow, true);
  assertEquals(gate.reason, "eligible");
});

Deno.test("shouldKickBriefGeneration blocks insufficient_evidence failures", () => {
  resetBriefKickCooldownForTests();
  const state = stateFromEvidenceReason({
    briefType: "am",
    briefDate: "2026-10-06",
    reason: "source_stale",
    failedAt: new Date().toISOString(),
  });
  const gate = shouldKickBriefGeneration({
    briefType: "am",
    briefDate: "2026-10-06",
    nowMinutesEt: 5 * 60,
    hasValidBrief: false,
    state,
    nowMs: 1_000_000,
  });
  assertEquals(gate.allow, false);
  assertEquals(gate.reason, "insufficient_evidence");
});

Deno.test("maybeKickBriefGeneration invokes generator once per cooldown", async () => {
  resetBriefKickCooldownForTests();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const base = {
    supabaseUrl: "https://example.supabase.co",
    syncSecret: "sync-secret",
    publishableKey: "anon-key",
    briefType: "am" as const,
    briefDate: "2026-10-06",
    nowMinutesEt: 6 * 60,
    hasValidBrief: false,
    stateRow: null,
    fetchImpl,
  };
  const first = await maybeKickBriefGeneration(base);
  const second = await maybeKickBriefGeneration({
    ...base,
    nowMinutesEt: 6 * 60 + 1,
  });
  assertEquals(first.kicked, true);
  assertEquals(second.kicked, false);
  assertEquals(second.reason, "cooldown");
  assertEquals(calls, 1);
  await new Promise((r) => setTimeout(r, 5));
  assertEquals(calls, 1);
});

Deno.test("cooldown duration matches product guard", () => {
  assertEquals(BRIEF_KICK_COOLDOWN_MS >= 60_000, true);
});
