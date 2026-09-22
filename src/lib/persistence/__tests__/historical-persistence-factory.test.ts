import { afterEach, describe, expect, it } from "vitest";
import { resolveHistoricalPersistenceTransport } from "@/lib/persistence/historical-persistence";

const ENV_KEYS = [
  "RADAR_BRIDGE_URL",
  "RADAR_WORKER_SECRET",
  "HISTORICAL_PRODUCTION_DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("resolveHistoricalPersistenceTransport", () => {
  it("prefers bridge when bridge credentials are present", () => {
    process.env.RADAR_BRIDGE_URL = "https://example.supabase.co/functions/v1/radar-worker-bridge";
    process.env.RADAR_WORKER_SECRET = "secret";
    process.env.HISTORICAL_PRODUCTION_DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/db";
    expect(resolveHistoricalPersistenceTransport()).toBe("bridge");
  });

  it("uses postgres when only direct database url is configured", () => {
    process.env.HISTORICAL_PRODUCTION_DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/db";
    expect(resolveHistoricalPersistenceTransport()).toBe("postgres");
  });

  it("does not select fly-side supabase credentials", () => {
    process.env.SUPABASE_URL = "https://zcjptaolpumhtlwhlemq.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(() => resolveHistoricalPersistenceTransport()).toThrow(/RADAR_BRIDGE_URL/);
  });
});
