import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dispatchStagedContinue,
} from "../../sync-screener-data/sync-staged-handler.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";

Deno.test("dispatchStagedContinue fails closed without SYNC_SECRET", async () => {
  const result = await dispatchStagedContinue(
    {
      env: () => "",
      fetch: fetch,
    },
    "https://example.com/sync-screener-data",
    { action: "continue", generation_id: crypto.randomUUID() },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "missing_secret");
});

Deno.test("dispatchStagedContinue records HTTP failure on store", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(20, "regular", nowMs);
  const acquired = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      nowMs,
      new Date(nowMs).toISOString(),
      crypto.randomUUID(),
      10,
    ),
    "lease-a",
    nowMs,
  );
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;

  const result = await dispatchStagedContinue(
    {
      env: (k) => (k === "SYNC_SECRET" ? "test-secret" : ""),
      fetch: async () => new Response("nope", { status: 503 }),
    },
    "https://example.com/sync-screener-data",
    { action: "continue", generation_id: acquired.job.id },
  );
  assertEquals(result.ok, false);
  await store.recordContinueDispatch({
    jobId: acquired.job.id,
    action: "continue",
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    nowMs,
  });
  const job = await store.get(acquired.job.id);
  assertEquals(job?.continueLastError?.startsWith("http_"), true);
});

Deno.test("findResumableJob picks up continue dispatch failure", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(20, "regular", nowMs);
  const acquired = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      nowMs,
      new Date(nowMs).toISOString(),
      crypto.randomUUID(),
      10,
    ),
    "lease-a",
    nowMs - 60_000,
  );
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  await store.recordContinueDispatch({
    jobId: acquired.job.id,
    action: "continue",
    ok: false,
    error: "http_503",
    nowMs,
  });
  const resume = await store.findResumableJob(nowMs);
  assertEquals(resume?.id, acquired.job.id);
});
