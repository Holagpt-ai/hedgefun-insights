import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearBriefGenerationState,
  parseGenerationState,
  publicGenerationState,
  resolveBriefRead,
  stateFromEvidenceReason,
  stateFromProviderFailure,
  writeBriefGenerationState,
  type BriefGenerationState,
} from "./generation-state.ts";

const AT = "2026-09-29T11:00:00.000Z";

function memoryWriter() {
  const rows = new Map<string, BriefGenerationState>();
  const admin = {
    from(table: string) {
      if (table !== "daily_brief_generation_state") throw new Error(table);
      return {
        upsert(row: BriefGenerationState) {
          rows.set(`${row.brief_type}:${row.brief_date}`, row);
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(column: string, value: string) {
              return {
                eq(_column2: string, value2: string) {
                  rows.delete(`${value}:${value2}`);
                  void column;
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { admin, rows };
}

Deno.test("successful brief read is Ready even if an older failure row exists", () => {
  const failed = stateFromProviderFailure({
    briefType: "am",
    briefDate: "2026-09-29",
    httpStatus: 500,
    outcome: "provider_error",
    errorType: "api_error",
    failedAt: AT,
  });
  assertEquals(resolveBriefRead({ hasValidBrief: true, state: failed }).generation_status, "ready");
});

Deno.test("timeout persists temporarily unavailable and retryable", async () => {
  const { admin, rows } = memoryWriter();
  const row = stateFromProviderFailure({
    briefType: "am",
    briefDate: "2026-09-29",
    httpStatus: null,
    outcome: "provider_error",
    errorType: "timeout",
    failedAt: AT,
  });
  await writeBriefGenerationState(admin, row);
  const stored = rows.get("am:2026-09-29");
  assertEquals(stored?.status, "temporarily_unavailable");
  assertEquals(stored?.failure_category, "TIMEOUT");
  assertEquals(stored?.retryable, true);
  const read = resolveBriefRead({ hasValidBrief: false, state: parseGenerationState(stored) });
  assertEquals(read.generation_status, "temporarily_unavailable");
  if (read.generation_status === "temporarily_unavailable") assertEquals(read.retryable, true);
});

Deno.test("provider 5xx persists temporarily unavailable and retryable", async () => {
  const { admin, rows } = memoryWriter();
  await writeBriefGenerationState(admin, stateFromProviderFailure({
    briefType: "am",
    briefDate: "2026-09-29",
    httpStatus: 503,
    outcome: "provider_error",
    errorType: "api_error",
    failedAt: AT,
  }));
  const stored = rows.get("am:2026-09-29");
  assertEquals(stored?.failure_category, "PROVIDER_5XX");
  assertEquals(stored?.retryable, true);
  const read = resolveBriefRead({ hasValidBrief: false, state: parseGenerationState(stored) });
  assertEquals(read.generation_status, "temporarily_unavailable");
});

Deno.test("auth failure persists temporarily unavailable and is not retryable", async () => {
  const { admin, rows } = memoryWriter();
  await writeBriefGenerationState(admin, stateFromProviderFailure({
    briefType: "am",
    briefDate: "2026-09-29",
    httpStatus: 401,
    outcome: "provider_error",
    errorType: "authentication_error",
    failedAt: AT,
  }));
  const stored = rows.get("am:2026-09-29");
  assertEquals(stored?.failure_category, "AUTH");
  assertEquals(stored?.retryable, false);
  const read = resolveBriefRead({ hasValidBrief: false, state: parseGenerationState(stored) });
  if (read.generation_status === "temporarily_unavailable") assertEquals(read.retryable, false);
});

Deno.test("insufficient evidence is persisted and replaces Generating", async () => {
  const { admin, rows } = memoryWriter();
  await writeBriefGenerationState(admin, stateFromEvidenceReason({
    briefType: "am",
    briefDate: "2026-09-29",
    reason: "source_stale",
    failedAt: AT,
  }));
  const stored = rows.get("am:2026-09-29");
  assertEquals(stored?.status, "insufficient_evidence");
  assertEquals(stored?.failure_category, "STALE_INPUT");
  assertEquals(stored?.retryable, false);
  const read = resolveBriefRead({ hasValidBrief: false, state: parseGenerationState(stored) });
  assertEquals(read.generation_status, "insufficient_evidence");
  assertEquals(resolveBriefRead({ hasValidBrief: false, state: null }).generation_status, "generating");
});

Deno.test("raw provider text is not a stored or returned field", () => {
  const row = stateFromProviderFailure({
    briefType: "am",
    briefDate: "2026-09-29",
    httpStatus: 500,
    outcome: "provider_error",
    errorType: "api_error",
    failedAt: AT,
  });
  const leaked = { ...row, errorMessage: "sk-ant-secret overloaded" };
  const safe = publicGenerationState(leaked as BriefGenerationState);
  const encoded = JSON.stringify(safe);
  assertEquals(encoded.includes("sk-ant"), false);
  assertEquals(encoded.includes("errorMessage"), false);
  assertEquals(encoded.includes("overloaded"), false);
  const read = resolveBriefRead({ hasValidBrief: false, state: safe });
  assertEquals(JSON.stringify(read).includes("sk-ant"), false);
});

Deno.test("reader source keeps Pro gating ahead of failure-state lookup", async () => {
  const src = await Deno.readTextFile(new URL("../../get-daily-brief/index.ts", import.meta.url));
  const pro = src.indexOf("Pro access required");
  const lookup = src.indexOf("failureResponse(admin");
  assertEquals(pro > 0 && lookup > pro, true);
});

Deno.test("a successful write clears the failure row", async () => {
  const { admin, rows } = memoryWriter();
  await writeBriefGenerationState(admin, stateFromEvidenceReason({
    briefType: "am",
    briefDate: "2026-09-29",
    reason: "source_unavailable",
    failedAt: AT,
  }));
  await clearBriefGenerationState(admin, "am", "2026-09-29");
  assertEquals(rows.size, 0);
  assertEquals(resolveBriefRead({ hasValidBrief: true, state: null }).generation_status, "ready");
});
