import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HistoricalBridgeClient,
  HistoricalBridgeError,
  HISTORICAL_BRIDGE_MAX_ATTEMPTS,
} from "@/lib/persistence/historical-bridge-client";

const BRIDGE_URL = "https://example.supabase.co/functions/v1/radar-worker-bridge";
const SECRET = "test-worker-secret";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HistoricalBridgeClient", () => {
  it("sends bearer auth and action payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, rows: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HistoricalBridgeClient({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
    });
    await client.call("historical_apply_daily_batch", { p_rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe("historical_apply_daily_batch");
    expect(body.p_rows).toEqual([]);
    expect(String(init.body)).not.toContain(SECRET);
  });

  it("rejects missing worker secret with 401 fail-closed", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HistoricalBridgeClient({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
    });
    await expect(client.call("historical_get_job", { job_id: crypto.randomUUID() }))
      .rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient 503 then succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < HISTORICAL_BRIDGE_MAX_ATTEMPTS) {
        return new Response("bad gateway", { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new HistoricalBridgeClient({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
      sleep: async () => {},
    });
    await client.call("historical_apply_daily_batch", { p_rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(HISTORICAL_BRIDGE_MAX_ATTEMPTS);
  });

  it("surfaces persist_failed detail for conflict detection", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "persist_failed",
      detail: "conflicting daily history for securityId and sessionDate",
    }), { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HistoricalBridgeClient({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
    });
    await expect(client.call("historical_apply_daily_batch", { p_rows: [{}] }))
      .rejects.toSatisfy((error: unknown) =>
        error instanceof HistoricalBridgeError
        && error.message.includes("conflicting daily history"));
  });

  it("paginates bridge list responses", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      const offset = body.page_offset as number;
      const rows = offset === 0
        ? [{ security_id: "a" }, { security_id: "b" }]
        : [{ security_id: "c" }];
      return new Response(JSON.stringify({
        ok: true,
        rows,
        has_more: offset === 0,
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new HistoricalBridgeClient({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
    });
    const rows = await client.fetchAllRows("historical_list_securities", {});
    expect(rows).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
