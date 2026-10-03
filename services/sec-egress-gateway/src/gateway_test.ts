import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createSecEgressGateway } from "./gateway.ts";
import { LATEST_FILINGS_UPSTREAM_URL } from "./registry.ts";

const SECRET = "gateway-test-secret";
const USER_AGENT = "Stocksist Gateway Test contact@example.com";
const ATOM = `<?xml version="1.0"?><feed><entry><title>8-K</title></entry></feed>`;

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${SECRET}`);
  return new Request(`http://gateway.internal${path}`, { ...init, headers });
}

function harness(input?: {
  now?: () => number;
  userAgent?: string;
  secret?: string;
}) {
  const calls: string[] = [];
  const headers: Headers[] = [];
  let fetchImpl: typeof fetch = (url, init) => {
    calls.push(String(url));
    headers.push(new Headers(init?.headers));
    return Promise.resolve(new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }));
  };
  const gateway = createSecEgressGateway({
    authSecret: input?.secret === undefined ? SECRET : input.secret,
    userAgent: input?.userAgent === undefined ? USER_AGENT : input.userAgent,
    nowMs: input?.now,
    fetchImpl: (url, init) => fetchImpl(url, init),
    minIntervalMs: 240_000,
    transportTtlMs: 240_000,
    log: () => {},
  });
  return {
    gateway,
    calls,
    headers,
    setFetch(next: typeof fetch) {
      fetchImpl = next;
    },
  };
}

Deno.test("gateway auth rejects missing and wrong secrets with zero upstream calls", async () => {
  const { gateway, calls } = harness();
  const missing = await gateway.handle(new Request("http://gateway.internal/v1/sec/latest-filings"));
  const wrong = await gateway.handle(authed("/v1/sec/latest-filings", { headers: { authorization: "Bearer wrong" } }));
  assertEquals(missing.status, 401);
  assertEquals(wrong.status, 403);
  assertEquals(calls, []);
  const missingBody = await missing.json();
  const wrongBody = await wrong.json();
  assertEquals(JSON.stringify(missingBody).includes(SECRET), false);
  assertEquals(JSON.stringify(wrongBody).includes(SECRET), false);
  assertEquals(JSON.stringify(wrongBody).includes(USER_AGENT), false);
});

Deno.test("gateway allows only the known filings operation", async () => {
  const { gateway, calls } = harness();
  const proxy = await gateway.handle(authed("/proxy?url=https://example.com"));
  const evilQuery = await gateway.handle(authed("/v1/sec/latest-filings?url=https://evil.example"));
  const companyMap = await gateway.handle(authed("/v1/sec/company-ticker-map"));
  const posted = await gateway.handle(authed("/v1/sec/latest-filings", { method: "POST" }));
  assertEquals(proxy.status, 404);
  assertEquals(companyMap.status, 404);
  assertEquals(posted.status, 405);
  assertEquals(calls, [LATEST_FILINGS_UPSTREAM_URL]);
  assertEquals(evilQuery.status, 200);
});

Deno.test("healthy filings request performs one upstream fetch with the configured User-Agent", async () => {
  const { gateway, calls, headers } = harness();
  const response = await gateway.handle(authed("/v1/sec/latest-filings", {
    headers: { "user-agent": "Caller Supplied Agent" },
  }));
  assertEquals(response.status, 200);
  assertEquals(await response.text(), ATOM);
  assertEquals(response.headers.get("content-type"), "application/atom+xml");
  assertEquals(response.headers.get("x-stocksist-result-source"), "live");
  assertEquals(calls, [LATEST_FILINGS_UPSTREAM_URL]);
  assertEquals(headers[0].get("user-agent"), USER_AGENT);
  assertEquals(headers[0].get("user-agent") === "Caller Supplied Agent", false);
});

Deno.test("gateway 429 does not replace the last successful transport cache", async () => {
  let now = 0;
  let mode: "ok" | "429" = "ok";
  const calls: string[] = [];
  const gateway = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    nowMs: () => now,
    minIntervalMs: 10_000,
    transportTtlMs: 240_000,
    fetchImpl: (url) => {
      calls.push(String(url));
      if (mode === "429") {
        return Promise.resolve(new Response("slow", { status: 429, headers: { "retry-after": "120", "content-type": "text/plain" } }));
      }
      return Promise.resolve(new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }));
    },
    log: () => {},
  });
  assertEquals((await gateway.handle(authed("/v1/sec/latest-filings"))).status, 200);
  now = 10_000;
  mode = "429";
  const limited = await gateway.handle(authed("/v1/sec/latest-filings"));
  assertEquals(limited.status, 429);
  assertEquals(limited.headers.get("retry-after"), "120");
  now = 15_000;
  const cached = await gateway.handle(authed("/v1/sec/latest-filings"));
  assertEquals(cached.status, 200);
  assertEquals(cached.headers.get("x-stocksist-result-source"), "transport_cache");
  assertEquals(await cached.text(), ATOM);
  assertEquals(calls.length, 2);
});

Deno.test("gateway returns one upstream 429 and preserves Retry-After", async () => {
  const calls: string[] = [];
  const gateway = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    fetchImpl: (url) => {
      calls.push(String(url));
      return Promise.resolve(new Response("slow", { status: 429, headers: { "retry-after": "900" } }));
    },
    log: () => {},
  });
  const response = await gateway.handle(authed("/v1/sec/latest-filings"));
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("retry-after"), "900");
  assertEquals(calls.length, 1);
});

Deno.test("gateway 5xx and timeout do not retry", async () => {
  let calls = 0;
  const errors = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(new Response("down", { status: 503 }));
    },
    log: () => {},
  });
  const failed = await errors.handle(authed("/v1/sec/latest-filings"));
  assertEquals(failed.status, 503);
  assertEquals(calls, 1);
  const body = await failed.json();
  assertEquals(body.error, "UPSTREAM_HTTP");

  let timeouts = 0;
  const timed = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    fetchImpl: () => {
      timeouts += 1;
      const error = new Error("timed out");
      error.name = "TimeoutError";
      return Promise.reject(error);
    },
    log: () => {},
  });
  const timeout = await timed.handle(authed("/v1/sec/latest-filings"));
  assertEquals(timeout.status, 504);
  assertEquals((await timeout.json()).error, "UPSTREAM_TIMEOUT");
  assertEquals(timeouts, 1);
});

Deno.test("concurrent filings requests share one upstream fetch", async () => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gateway = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    fetchImpl: () => {
      calls += 1;
      return gate.then(() => new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }));
    },
    log: () => {},
  });
  const first = gateway.handle(authed("/v1/sec/latest-filings"));
  for (let i = 0; i < 20 && calls === 0; i += 1) await Promise.resolve();
  const second = gateway.handle(authed("/v1/sec/latest-filings"));
  release();
  const [a, b] = await Promise.all([first, second]);
  assertEquals(a.status, 200);
  assertEquals(b.status, 200);
  assertEquals(await a.text(), ATOM);
  assertEquals(await b.text(), ATOM);
  assertEquals(calls, 1);
});

Deno.test("minimum interval reuses the transport cache and a later request reaches SEC", async () => {
  let now = 0;
  let calls = 0;
  const gateway = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    nowMs: () => now,
    minIntervalMs: 240_000,
    transportTtlMs: 240_000,
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(new Response(`${ATOM}${calls}`, { status: 200, headers: { "content-type": "application/atom+xml" } }));
    },
    log: () => {},
  });
  const live = await gateway.handle(authed("/v1/sec/latest-filings"));
  assertEquals(live.headers.get("x-stocksist-result-source"), "live");
  now = 239_000;
  const cached = await gateway.handle(authed("/v1/sec/latest-filings"));
  assertEquals(cached.headers.get("x-stocksist-result-source"), "transport_cache");
  assertEquals(await cached.text(), `${ATOM}1`);
  assertEquals(calls, 1);
  now = 240_000;
  const again = await gateway.handle(authed("/v1/sec/latest-filings"));
  assertEquals(again.headers.get("x-stocksist-result-source"), "live");
  assertEquals(await again.text(), `${ATOM}2`);
  assertEquals(calls, 2);
});

Deno.test("health does not contact SEC or reveal secrets", async () => {
  let calls = 0;
  const gateway = createSecEgressGateway({
    authSecret: SECRET,
    userAgent: USER_AGENT,
    egressIdentity: "egress-verified",
    fetchImpl: () => {
      calls += 1;
      return Promise.reject(new Error("should not fetch"));
    },
    log: () => {},
  });
  const response = await gateway.handle(new Request("http://gateway.internal/health"));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.sec_user_agent_configured, true);
  assertEquals(body.gateway_auth_configured, true);
  assertEquals(body.egress_identity_configured, true);
  assertEquals(calls, 0);
  const text = JSON.stringify(body);
  assert(!text.includes(SECRET));
  assert(!text.includes(USER_AGENT));
  assert(!text.includes("egress-verified"));
});
