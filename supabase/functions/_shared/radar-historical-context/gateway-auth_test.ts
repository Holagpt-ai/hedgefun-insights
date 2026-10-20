import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authenticateRadarHistoricalContextRequest,
  collectConfiguredProjectApiKeys,
  decodeJwtPayload,
} from "./gateway-auth.ts";

const SUPABASE_URL = "https://zcjptaolpumhtlwhlemq.supabase.co";
const LEGACY_ANON =
  "eyJhbGci.anon.test.legacy-key-part3";
const PUBLISHABLE =
  "eyJhbGci.publishable.test.publishable-key-part3";

function anonJwt(ref: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "anon", ref, iss: "supabase" }));
  return `${header}.${payload}.signature`;
}

Deno.test("collectConfiguredProjectApiKeys dedupes anon and publishable", () => {
  const keys = collectConfiguredProjectApiKeys({
    anonKey: LEGACY_ANON,
    publishableKey: LEGACY_ANON,
  });
  assertEquals(keys.length, 1);
  assertEquals(keys[0], LEGACY_ANON);
});

Deno.test("missing credentials rejected", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: null,
    apikeyHeader: null,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: null }),
    validateApiKey: async () => true,
  });
  assertEquals(result, null);
});

Deno.test("configured legacy anon key permitted when gateway validates", async () => {
  const jwt = anonJwt("zcjptaolpumhtlwhlemq");
  let validated: string | null = null;
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${jwt}`,
    apikeyHeader: jwt,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: null }),
    validateApiKey: async (_url, key) => {
      validated = key;
      return true;
    },
  });
  assertEquals(result, { mode: "public" });
  assertEquals(validated, jwt);
});

Deno.test("publishable JWT permitted when configured and validated", async () => {
  const jwt = anonJwt("zcjptaolpumhtlwhlemq");
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${jwt}`,
    apikeyHeader: null,
    anonKey: "",
    publishableKey: jwt,
    getUser: async () => ({ userId: null }),
    validateApiKey: async () => true,
  });
  assertEquals(result, { mode: "public" });
});

Deno.test("sb_publishable_* rejected", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: "Bearer sb_publishable_abc123",
    apikeyHeader: null,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: null }),
    validateApiKey: async () => true,
  });
  assertEquals(result, null);
});

Deno.test("invalid arbitrary publishable-looking JWT rejected when not configured", async () => {
  const jwt = anonJwt("wrong-project-ref");
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${jwt}`,
    apikeyHeader: null,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: null }),
    validateApiKey: async () => false,
  });
  assertEquals(result, null);
});

Deno.test("valid signed-in user JWT accepted", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: "Bearer user-access-token",
    apikeyHeader: LEGACY_ANON,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: "user-uuid" }),
    validateApiKey: async () => true,
  });
  assertEquals(result, { mode: "user", authorizationHeader: "Bearer user-access-token" });
});

Deno.test("invalid user JWT rejected when getUser fails", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: "Bearer bad-user-token",
    apikeyHeader: LEGACY_ANON,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: null }),
    validateApiKey: async () => false,
  });
  assertEquals(result, null);
});

Deno.test("service_role JWT rejected for public path", async () => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "service_role", ref: "zcjptaolpumhtlwhlemq" }));
  const token = `${header}.${payload}.sig`;
  assertEquals(decodeJwtPayload(token)?.role, "service_role");
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${token}`,
    apikeyHeader: null,
    anonKey: LEGACY_ANON,
    publishableKey: PUBLISHABLE,
    getUser: async () => ({ userId: null }),
    validateApiKey: async () => true,
  });
  assertEquals(result, null);
});
