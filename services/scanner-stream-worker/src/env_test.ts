import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadEnv, EnvValidationError } from "./env.ts";
import { sanitizeLogValue } from "./log.ts";

Deno.test("loadEnv requires POLYGON_API_KEY, RADAR_BRIDGE_URL, RADAR_WORKER_SECRET", () => {
  try {
    loadEnv(() => undefined);
    throw new Error("expected throw");
  } catch (error) {
    assertEquals(error instanceof EnvValidationError, true);
    assertEquals((error as EnvValidationError).code, "missing_env");
  }
});

Deno.test("loadEnv does not require SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL", () => {
  const env = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "worker-secret";
    return undefined;
  });
  assertEquals(env.polygonApiKey, "poly");
  assertEquals(env.radarBridgeUrl.endsWith("radar-worker-bridge"), true);
  assertEquals(env.radarWorkerSecret, "worker-secret");
  assertEquals(env.massiveWsMode, "delayed");
  assertEquals("supabaseServiceRoleKey" in env, false);
  assertEquals("supabaseUrl" in env, false);
});

Deno.test("loadEnv rejects invalid RADAR_BRIDGE_URL", () => {
  try {
    loadEnv((k) => {
      if (k === "POLYGON_API_KEY") return "poly";
      if (k === "RADAR_BRIDGE_URL") return "not-a-url";
      if (k === "RADAR_WORKER_SECRET") return "secret";
      return undefined;
    });
    throw new Error("expected throw");
  } catch (error) {
    assertEquals((error as EnvValidationError).code, "invalid_env");
  }
});

Deno.test("sanitizeLogValue redacts worker secret shaped fields", () => {
  const out = sanitizeLogValue({
    RADAR_WORKER_SECRET: "super-secret",
    Authorization: "Bearer super-secret",
    note: "ok",
  }) as Record<string, unknown>;
  assertEquals(out.RADAR_WORKER_SECRET, "[redacted]");
  assertEquals(out.Authorization, "[redacted]");
  assertEquals(out.note, "ok");
});
