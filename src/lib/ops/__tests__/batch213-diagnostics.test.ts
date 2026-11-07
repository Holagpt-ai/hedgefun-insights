import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isCalendarCoverageVerified,
  parseOpsDiagnostics,
  resolveSessionContextWithCalendar,
  type OpsCalendar,
} from "@/lib/ops/diagnostics";
import { buildOpsSnapshot, type OpsSnapshotInputs } from "@/lib/ops/snapshot";
import { OPS_DIAGNOSTICS_RPC, readScannerDiagnostics, type SourceResult } from "@/lib/ops/sources";
import type { FeedStateOpsRow } from "@/lib/ops/scanner";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// Thu 2026-11-26 (Thanksgiving) 10:30 ET = 15:30Z.
const THANKSGIVING_RTH = Date.parse("2026-11-26T15:30:00Z");
// Fri 2026-11-06 10:30 ET.
const RTH_NOW = Date.parse("2026-11-06T15:30:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function rawJob(over: Record<string, unknown> = {}) {
  return {
    id: U(1),
    sync_run_id: U(101),
    status: "published",
    next_chunk_index: 7,
    total_chunks: 7,
    lease_expires_at: null,
    finalize_lease_expires_at: null,
    continue_last_at: null,
    continue_last_error: null,
    abort_reason: null,
    abort_prior_synced_at: null,
    abort_tabs: null,
    publish_rows_inserted: 85,
    publish_rpc_recorded_at: iso(RTH_NOW - 60_000),
    created_at: iso(RTH_NOW - 5 * 60_000),
    updated_at: iso(RTH_NOW - 60_000),
    ...over,
  };
}

function rawDiagnostics(over: Record<string, unknown> = {}, calendar: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    observed_at: iso(RTH_NOW),
    job_limit: 10,
    jobs: [rawJob()],
    stranded_finalizing_count: 0,
    calendar: {
      today_et: "2026-11-06",
      loaded: true,
      latest_updated_at: iso(RTH_NOW - 86_400_000),
      max_session_date: "2026-12-25",
      exceptions: [],
      ...calendar,
    },
    ...over,
  };
}

const thanksgivingCalendar: OpsCalendar = {
  todayEt: "2026-11-26",
  loaded: true,
  latestUpdatedAt: iso(THANKSGIVING_RTH - 86_400_000),
  maxSessionDate: "2026-12-25",
  exceptions: [
    {
      session_date: "2026-11-26",
      market_status: "closed",
      regular_open_et: "09:30:00",
      regular_close_et: "16:00:00",
      after_hours_end_et: "20:00:00",
      holiday_name: "Thanksgiving Day",
    },
    {
      session_date: "2026-11-27",
      market_status: "early_close",
      regular_open_et: "09:30:00",
      regular_close_et: "13:00:00",
      after_hours_end_et: "17:00:00",
      holiday_name: "Day after Thanksgiving",
    },
  ],
};

function feedRow(syncedAtMs: number): FeedStateOpsRow {
  return {
    state_key: "current",
    sync_run_id: U(900),
    status: "available",
    synced_at: iso(syncedAtMs),
    provider_as_of_min: iso(syncedAtMs - 20 * 60_000),
    provider_as_of_max: iso(syncedAtMs - 16 * 60_000),
    rows_inserted: 85,
    tab_counts: {},
    nhl_baseline_status: "available",
    tab_evaluation_evidence: null,
    updated_at: iso(syncedAtMs),
  };
}

const unavailable = <T,>(reason: "no_read_path" | "not_configured" = "no_read_path"): SourceResult<T> => ({
  state: "unavailable",
  reason,
  detail: "test",
  fetchedAt: iso(RTH_NOW),
});

function inputs(over: Partial<OpsSnapshotInputs>): OpsSnapshotInputs {
  return {
    nowMs: RTH_NOW,
    feedState: { state: "ok", data: feedRow(RTH_NOW - 5 * 60_000), fetchedAt: iso(RTH_NOW) },
    radarFeed: unavailable(),
    diagnostics: unavailable(),
    edgeLogs: unavailable(),
    sourceSync: unavailable(),
    attestations: [],
    frontendBuildSha: null,
    ...over,
  };
}

const diagOk = (raw: unknown, nowMs = RTH_NOW): SourceResult<NonNullable<ReturnType<typeof parseOpsDiagnostics>>> => ({
  state: "ok",
  data: parseOpsDiagnostics(raw)!,
  fetchedAt: iso(nowMs),
});

describe("diagnostics payload parser (boundary)", () => {
  it("accepts schema_version 1 and keeps only whitelisted fields", () => {
    const raw = rawDiagnostics({
      jobs: [rawJob({ all_tickers: ["AAPL"], merged_artifacts: { x: 1 }, lease_token: U(5), observation: { a: 1 } })],
    });
    const d = parseOpsDiagnostics(raw)!;
    expect(d.jobs).toHaveLength(1);
    const keys = Object.keys(d.jobs[0]);
    for (const leaked of ["all_tickers", "merged_artifacts", "lease_token", "observation"]) expect(keys).not.toContain(leaked);
  });

  it("rejects unknown schema versions and non-objects", () => {
    expect(parseOpsDiagnostics(rawDiagnostics({ schema_version: 2 }))).toBeNull();
    expect(parseOpsDiagnostics(null)).toBeNull();
    expect(parseOpsDiagnostics([])).toBeNull();
    expect(parseOpsDiagnostics(rawDiagnostics({ jobs: "nope" }))).toBeNull();
  });

  it("drops malformed jobs instead of guessing", () => {
    const d = parseOpsDiagnostics(
      rawDiagnostics({
        jobs: [rawJob(), rawJob({ id: "not-a-uuid" }), rawJob({ status: "exploded" }), rawJob({ total_chunks: -1 })],
      }),
    )!;
    expect(d.jobs).toHaveLength(1);
  });

  it("caps at 20 jobs even if the server returned more", () => {
    const jobs = Array.from({ length: 30 }, (_, i) => rawJob({ id: U(i + 1) }));
    expect(parseOpsDiagnostics(rawDiagnostics({ jobs }))!.jobs).toHaveLength(20);
  });

  it("re-redacts error text on the client", () => {
    const d = parseOpsDiagnostics(
      rawDiagnostics({ jobs: [rawJob({ status: "failed", continue_last_error: "http_546 apiKey=LEAKEDKEY99 Bearer abcdefghijklmnop" })] }),
    )!;
    expect(d.jobs[0].continue_last_error).not.toContain("LEAKEDKEY99");
    expect(d.jobs[0].continue_last_error).not.toContain("abcdefghijklmnop");
    expect(d.jobs[0].continue_last_error).toContain("http_546");
  });

  it("ignores unknown abort reasons and malformed calendar rows", () => {
    const d = parseOpsDiagnostics(
      rawDiagnostics(
        { jobs: [rawJob({ status: "aborted", abort_reason: "something_else" })] },
        { exceptions: [{ session_date: "2026-11-26", market_status: "open", regular_open_et: "09:30", regular_close_et: "16:00", after_hours_end_et: "20:00" }] },
      ),
    )!;
    expect(d.jobs[0].abort_reason).toBeNull();
    expect(d.calendar.exceptions).toHaveLength(0);
  });
});

describe("holiday-aware session resolution", () => {
  it("a calendar holiday during market hours is closed and verified, not an outage", () => {
    const ctx = resolveSessionContextWithCalendar(THANKSGIVING_RTH, thanksgivingCalendar);
    expect(ctx.calendarVerified).toBe(true);
    expect(ctx.session).toBe("closed");
    expect(ctx.holidayName).toBe("Thanksgiving Day");
  });

  it("without the calendar the same instant would look like a regular session", () => {
    const ctx = resolveSessionContextWithCalendar(THANKSGIVING_RTH, null);
    expect(ctx.calendarVerified).toBe(false);
    expect(ctx.session).toBe("market");
  });

  it("an early close ends the regular session at 13:00 ET", () => {
    const at1430 = Date.parse("2026-11-27T19:30:00Z");
    const ctx = resolveSessionContextWithCalendar(at1430, thanksgivingCalendar);
    expect(ctx.session).toBe("after-hours");
    expect(ctx.marketStatus).toBe("early_close");
  });

  it("calendar coverage is unverified when not loaded or when it ends before today", () => {
    expect(isCalendarCoverageVerified({ ...thanksgivingCalendar, loaded: false }, THANKSGIVING_RTH)).toBe(false);
    expect(isCalendarCoverageVerified({ ...thanksgivingCalendar, maxSessionDate: "2026-11-01" }, THANKSGIVING_RTH)).toBe(false);
    expect(isCalendarCoverageVerified(null, THANKSGIVING_RTH)).toBe(false);
    expect(isCalendarCoverageVerified(thanksgivingCalendar, THANKSGIVING_RTH)).toBe(true);
  });

  it("stale publication on a holiday is not applicable; on a verified normal weekday it is failing", () => {
    const holidayRaw = rawDiagnostics(
      { observed_at: iso(THANKSGIVING_RTH) },
      {
        today_et: "2026-11-26",
        exceptions: thanksgivingCalendar.exceptions,
      },
    );
    const holiday = buildOpsSnapshot(
      inputs({
        nowMs: THANKSGIVING_RTH,
        feedState: { state: "ok", data: feedRow(THANKSGIVING_RTH - 20 * 3_600_000), fetchedAt: iso(THANKSGIVING_RTH) },
        diagnostics: diagOk(holidayRaw, THANKSGIVING_RTH),
      }),
    );
    expect(holiday.components.find((c) => c.id === "scanner")!.status).toBe("not_applicable");

    const weekday = buildOpsSnapshot(
      inputs({
        feedState: { state: "ok", data: feedRow(RTH_NOW - 3 * 3_600_000), fetchedAt: iso(RTH_NOW) },
        diagnostics: diagOk(rawDiagnostics()),
      }),
    );
    expect(weekday.context.calendarVerified).toBe(true);
    expect(weekday.components.find((c) => c.id === "scanner")!.status).toBe("failing");
  });
});

describe("snapshot classification with diagnostics", () => {
  it("diagnostics RPC not applied → generation pipeline Not configured, never healthy", () => {
    const s = buildOpsSnapshot(inputs({ diagnostics: unavailable("not_configured") }));
    expect(s.components.find((c) => c.id === "edge")!.status).toBe("not_configured");
    expect(s.jobs).toBeNull();
  });

  it("latest published + persisted job → healthy pipeline", () => {
    const s = buildOpsSnapshot(inputs({ diagnostics: diagOk(rawDiagnostics()) }));
    expect(s.components.find((c) => c.id === "edge")!.status).toBe("healthy");
    expect(s.jobs![0].outcome).toBe("published_persisted");
  });

  it("any stranded finalizing job → pipeline failing even if latest published", () => {
    const s = buildOpsSnapshot(inputs({ diagnostics: diagOk(rawDiagnostics({ stranded_finalizing_count: 1 })) }));
    const edge = s.components.find((c) => c.id === "edge")!;
    expect(edge.status).toBe("failing");
    expect(edge.explanation).toMatch(/stranded/);
  });

  it("7/7 chunks + failed finalize with HTTP 546 → failing, classified as resource limit, scanner degraded", () => {
    const s = buildOpsSnapshot(
      inputs({
        diagnostics: diagOk(
          rawDiagnostics({
            jobs: [
              rawJob({ status: "failed", continue_last_error: "finalize http_546", publish_rows_inserted: null, publish_rpc_recorded_at: null }),
              rawJob({ id: U(2), sync_run_id: U(102), created_at: iso(RTH_NOW - 20 * 60_000) }),
            ],
          }),
        ),
      }),
    );
    expect(s.jobs![0].outcome).toBe("finalize_failed_after_all_chunks");
    expect(s.jobs![0].failure!.kind).toBe("edge_resource_limit_546");
    expect(s.components.find((c) => c.id === "edge")!.status).toBe("failing");
    const scanner = s.components.find((c) => c.id === "scanner")!;
    expect(scanner.status).toBe("degraded");
    expect(scanner.explanation).toMatch(/did not publish/);
  });

  it("generic HTTP 500 is not reported as CPU or resource-limit exhaustion", () => {
    const s = buildOpsSnapshot(
      inputs({ diagnostics: diagOk(rawDiagnostics({ jobs: [rawJob({ status: "failed", next_chunk_index: 3, continue_last_error: "status 500" })] })) }),
    );
    expect(s.jobs![0].failure!.kind).toBe("http_error");
    expect(s.jobs![0].outcome).toBe("failed_during_chunking");
  });

  it("prior generation retained → names the triggering tab and degrades a fresh-looking scanner", () => {
    const s = buildOpsSnapshot(
      inputs({
        diagnostics: diagOk(
          rawDiagnostics({
            jobs: [
              rawJob({
                status: "aborted",
                abort_reason: "prior_generation_retained",
                publish_rows_inserted: null,
                publish_rpc_recorded_at: null,
                abort_tabs: [
                  { tab: "gappers", prior_status: "evaluated", candidate_status: "prerequisite_unavailable", triggered_preservation: true },
                  { tab: "gainers_losers", prior_status: "evaluated", candidate_status: "evaluated", triggered_preservation: false },
                ],
              }),
            ],
          }),
        ),
      }),
    );
    expect(s.jobs![0].outcome).toBe("prior_generation_retained");
    expect(s.jobs![0].explanation).toContain("gappers (evaluated → prerequisite_unavailable)");
    expect(s.jobs![0].explanation).not.toContain("gainers_losers");
    expect(s.components.find((c) => c.id === "scanner")!.status).toBe("degraded");
  });

  it("an in-progress chunking job does not degrade the scanner", () => {
    const s = buildOpsSnapshot(
      inputs({
        diagnostics: diagOk(
          rawDiagnostics({
            jobs: [
              rawJob({ status: "chunking", next_chunk_index: 2, lease_expires_at: iso(RTH_NOW + 60_000), publish_rows_inserted: null, publish_rpc_recorded_at: null }),
              rawJob({ id: U(2), sync_run_id: U(102), created_at: iso(RTH_NOW - 20 * 60_000) }),
            ],
          }),
        ),
      }),
    );
    expect(s.components.find((c) => c.id === "scanner")!.status).toBe("healthy");
  });

  it("superseded generation (newer_generation_live) is not a failure", () => {
    const s = buildOpsSnapshot(
      inputs({
        diagnostics: diagOk(
          rawDiagnostics({ jobs: [rawJob({ status: "aborted", abort_reason: "newer_generation_live", publish_rows_inserted: null, publish_rpc_recorded_at: null })] }),
        ),
      }),
    );
    expect(s.components.find((c) => c.id === "scanner")!.status).toBe("healthy");
  });
});

describe("diagnostics adapter (integration with mocked PostgREST client)", () => {
  const client = (result: { data: unknown; error: { code?: string; message?: string } | null }) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } };
  };

  it("calls only the admin diagnostics RPC with a bounded limit", async () => {
    const c = client({ data: rawDiagnostics(), error: null });
    const r = await readScannerDiagnostics(c.client);
    expect(c.rpc).toHaveBeenCalledWith(OPS_DIAGNOSTICS_RPC, { p_job_limit: 10 });
    expect(r.state).toBe("ok");
  });

  it("missing function (migration not applied) → not configured", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const r = await readScannerDiagnostics(client({ data: null, error: { code, message: "not found" } }).client);
      expect(r.state === "unavailable" && r.reason).toBe("not_configured");
    }
  });

  it("non-admin rejection (42501) → permission denied, not empty", async () => {
    const r = await readScannerDiagnostics(client({ data: null, error: { code: "42501", message: "admin role required" } }).client);
    expect(r.state === "unavailable" && r.reason).toBe("permission_denied");
  });

  it("unexpected payload → invalid response", async () => {
    const r = await readScannerDiagnostics(client({ data: { schema_version: 9 }, error: null }).client);
    expect(r.state === "unavailable" && r.reason).toBe("invalid_response");
  });

  it("thrown transport errors resolve without throwing", async () => {
    const r = await readScannerDiagnostics({
      rpc: () => {
        throw new Error("Failed to fetch");
      },
    });
    expect(r.state === "unavailable" && r.reason).toBe("network_error");
  });
});

describe("migration contract (static)", () => {
  const sql = readFileSync(
    path.resolve(__dirname, "../../../../supabase/migrations/20261106200000_ops_scanner_diagnostics_read_v1.sql"),
    "utf8",
  );
  const body = sql.slice(sql.indexOf("get_ops_scanner_diagnostics_v1(p_job_limit"), sql.indexOf("REVOKE ALL ON FUNCTION public.get_ops_scanner_diagnostics_v1"));

  it("is SECURITY DEFINER with an empty search_path and checks has_role(auth.uid(), admin)", () => {
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = ''/);
    expect(body).toMatch(/auth\.uid\(\)/);
    expect(body).toMatch(/public\.has_role\(v_uid, 'admin'::public\.app_role\)/);
    expect(body).toMatch(/ERRCODE = '42501'/);
  });

  it("revokes PUBLIC/anon/service_role and grants only authenticated", () => {
    expect(sql).toMatch(/get_ops_scanner_diagnostics_v1\(integer\) FROM PUBLIC/);
    expect(sql).toMatch(/get_ops_scanner_diagnostics_v1\(integer\) FROM anon/);
    expect(sql).toMatch(/get_ops_scanner_diagnostics_v1\(integer\) FROM service_role/);
    const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO (\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(grants).toEqual(["get_ops_scanner_diagnostics_v1:authenticated"]);
  });

  it("is read-only and never references payload columns", () => {
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|PERFORM)\b/);
    for (const col of ["all_tickers", "merged_artifacts", "nhl_baseline_snapshot", "observation", "lease_token", "gainers", "losers"]) {
      expect(body).not.toMatch(new RegExp(`j\\.${col}\\b`));
    }
    expect(sql).not.toMatch(/ALTER TABLE|CREATE TABLE|CREATE TRIGGER|cron\./i);
  });

  it("references are schema-qualified", () => {
    expect(body).toMatch(/FROM public\.screener_sync_generation_jobs j/);
    expect(body).toMatch(/FROM public\.market_session_calendar c/);
    expect(body).not.toMatch(/FROM (screener_sync_generation_jobs|market_session_calendar)\b/);
  });

  it("bounds the job limit to 1..20", () => {
    expect(body).toMatch(/GREATEST\(LEAST\(COALESCE\(p_job_limit, 10\), 20\), 1\)/);
  });
});
