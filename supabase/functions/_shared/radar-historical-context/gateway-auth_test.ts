import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authenticateRadarHistoricalContextRequest,
  decodeJwtPayload,
  rejectsUnsafeCredentialShape,
} from "./gateway-auth.ts";

const SUPABASE_URL = "https://zcjptaolpumhtlwhlemq.supabase.co";

function anonJwt(ref: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "anon", ref, iss: "supabase" }));
  return `${header}.${payload}.signature`;
}

Deno.test("missing credentials allow public read-only mode", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: null,
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, { mode: "public" });
});

Deno.test("frontend anon-role JWT allows public mode without runtime key match", async () => {
  const jwt = anonJwt("zcjptaolpumhtlwhlemq");
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${jwt}`,
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, { mode: "public" });
});

Deno.test("sb_publishable_* rejected", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: "Bearer sb_publishable_abc123",
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, null);
});

Deno.test("service_role JWT rejected", async () => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "service_role", ref: "zcjptaolpumhtlwhlemq" }));
  const token = `${header}.${payload}.sig`;
  assertEquals(decodeJwtPayload(token)?.role, "service_role");
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${token}`,
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, null);
});

Deno.test("wrong project ref in bearer rejected when bearer supplied", async () => {
  const jwt = anonJwt("wrong-project-ref");
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${jwt}`,
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, null);
});

Deno.test("valid signed-in user JWT accepted", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: "Bearer user-access-token",
    getUser: async () => ({ userId: "user-uuid" }),
  });
  assertEquals(result, { mode: "user", authorizationHeader: "Bearer user-access-token" });
});

Deno.test("invalid user JWT with authenticated role rejected", async () => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "authenticated", sub: "user-id" }));
  const token = `${header}.${payload}.sig`;
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: `Bearer ${token}`,
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, null);
});

Deno.test("malformed Authorization header rejected", async () => {
  const result = await authenticateRadarHistoricalContextRequest({
    supabaseUrl: SUPABASE_URL,
    authorizationHeader: "Token not-bearer",
    getUser: async () => ({ userId: null }),
  });
  assertEquals(result, null);
});

Deno.test("rejectsUnsafeCredentialShape blocks sb_publishable prefix", () => {
  assertEquals(rejectsUnsafeCredentialShape("sb_publishable_x", "ref"), true);
});
