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
  assertEquals(env.radarSentinelEnabled, false);
  assertEquals(env.radarPersistenceV2Enabled, false);
  assertEquals(env.radarPersistenceV2CheckpointMs, 30_000);
  assertEquals("supabaseServiceRoleKey" in env, false);
  assertEquals("supabaseUrl" in env, false);
});

Deno.test("loadEnv RADAR_SENTINEL_ENABLED defaults false and accepts true/false", () => {
  const on = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    if (k === "RADAR_SENTINEL_ENABLED") return "true";
    return undefined;
  });
  assertEquals(on.radarSentinelEnabled, true);
  const off = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    if (k === "RADAR_SENTINEL_ENABLED") return "0";
    return undefined;
  });
  assertEquals(off.radarSentinelEnabled, false);
});

Deno.test("loadEnv RADAR_PERSISTENCE_V2_ENABLED defaults false", () => {
  const env = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    return undefined;
  });
  assertEquals(env.radarPersistenceV2Enabled, false);
  const on = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    if (k === "RADAR_PERSISTENCE_V2_ENABLED") return "true";
    return undefined;
  });
  assertEquals(on.radarPersistenceV2Enabled, true);
});

Deno.test("loadEnv RADAR_PERSISTENCE_V2_CHECKPOINT_MS default and bounds", () => {
  const env = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    return undefined;
  });
  assertEquals(env.radarPersistenceV2CheckpointMs, 30_000);
  const custom = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    if (k === "RADAR_PERSISTENCE_V2_CHECKPOINT_MS") return "45000";
    return undefined;
  });
  assertEquals(custom.radarPersistenceV2CheckpointMs, 45_000);
  const min = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    if (k === "RADAR_PERSISTENCE_V2_CHECKPOINT_MS") return "5000";
    return undefined;
  });
  assertEquals(min.radarPersistenceV2CheckpointMs, 5_000);
  const max = loadEnv((k) => {
    if (k === "POLYGON_API_KEY") return "poly";
    if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
    if (k === "RADAR_WORKER_SECRET") return "secret";
    if (k === "RADAR_PERSISTENCE_V2_CHECKPOINT_MS") return "300000";
    return undefined;
  });
  assertEquals(max.radarPersistenceV2CheckpointMs, 300_000);
  for (const raw of ["0", "4999", "300001", "abc"]) {
    try {
      loadEnv((k) => {
        if (k === "POLYGON_API_KEY") return "poly";
        if (k === "RADAR_BRIDGE_URL") return "https://example.supabase.co/functions/v1/radar-worker-bridge";
        if (k === "RADAR_WORKER_SECRET") return "secret";
        if (k === "RADAR_PERSISTENCE_V2_CHECKPOINT_MS") return raw;
        return undefined;
      });
      throw new Error(`expected throw for ${raw}`);
    } catch (error) {
      assertEquals((error as EnvValidationError).code, "invalid_env");
    }
  }
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
