import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildOpsSnapshot } from "@/lib/ops/snapshot";
import type { OpsSnapshot } from "@/lib/ops/snapshot";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

let snapshot: OpsSnapshot | null = null;
vi.mock("@/hooks/useOperationsSnapshot", () => ({
  useOperationsSnapshot: () => ({ snapshot, loading: snapshot === null, refetch: () => {}, refreshing: false }),
}));

import AdminOperationsPage from "@/pages/admin/AdminOperationsPage";

const NOW = Date.parse("2026-11-06T15:30:00Z");
const unavailable = { state: "unavailable", reason: "no_read_path", detail: "test-only fixture", fetchedAt: new Date(NOW).toISOString() } as const;

describe("AdminOperationsPage render (test fixture only)", () => {
  it("shows a loading state without fabricating data", () => {
    snapshot = null;
    render(<AdminOperationsPage />);
    expect(screen.getByText(/Reading evidence sources/)).toBeTruthy();
  });

  it("renders every panel when all sources are unavailable, with Unknown and no Healthy", () => {
    snapshot = buildOpsSnapshot({
      nowMs: NOW,
      feedState: unavailable,
      radarFeed: unavailable,
      diagnostics: unavailable,
      edgeLogs: unavailable,
      sourceSync: unavailable,
      attestations: [],
      frontendBuildSha: null,
    });
    const { container } = render(<AdminOperationsPage />);
    expect(screen.getByText("Scanner and data pipeline")).toBeTruthy();
    expect(screen.getByText("Edge runtime failures", { selector: "h2" })).toBeTruthy();
    expect(screen.getByText("Source synchronization and deployment")).toBeTruthy();
    expect(container.querySelector('[data-ops-status="healthy"]')).toBeNull();
    expect(container.querySelectorAll('[data-ops-status="unknown"]').length).toBeGreaterThan(0);
  });

  it("renders the generation jobs table and calendar state when diagnostics are available", () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    snapshot = buildOpsSnapshot({
      nowMs: NOW,
      feedState: unavailable,
      radarFeed: unavailable,
      diagnostics: {
        state: "ok",
        fetchedAt: iso(NOW),
        data: {
          observedAt: iso(NOW),
          jobLimit: 10,
          strandedFinalizingCount: 2,
          calendar: { todayEt: "2026-11-06", loaded: true, latestUpdatedAt: iso(NOW), maxSessionDate: "2026-12-25", exceptions: [] },
          jobs: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              sync_run_id: "09346799-0000-4000-8000-000000000000",
              status: "finalizing",
              next_chunk_index: 7,
              total_chunks: 7,
              lease_expires_at: null,
              finalize_lease_expires_at: iso(NOW - 60_000),
              continue_last_at: null,
              continue_last_error: "finalize http_546",
              abort_reason: null,
              publish_rows_inserted: null,
              publish_rpc_recorded_at: null,
              created_at: iso(NOW - 600_000),
              updated_at: iso(NOW - 300_000),
            },
          ],
        },
      },
      edgeLogs: unavailable,
      sourceSync: unavailable,
      attestations: [],
      frontendBuildSha: null,
    });
    render(<AdminOperationsPage />);
    expect(screen.getByText("09346799")).toBeTruthy();
    expect(screen.getByText("7/7")).toBeTruthy();
    expect(screen.getByText(/exception calendar verified/)).toBeTruthy();
    expect(screen.getByText("Edge resource limit (HTTP 546)")).toBeTruthy();
    expect(screen.getAllByText(/Stranded in finalizing/).length).toBeGreaterThan(0);
  });
});
