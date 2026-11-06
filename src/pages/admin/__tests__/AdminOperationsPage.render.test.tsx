import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildOpsSnapshot } from "@/lib/ops/snapshot";
import { resolveSessionContext } from "@/lib/ops/freshness";
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
      context: resolveSessionContext(NOW),
      feedState: unavailable,
      radarFeed: unavailable,
      jobs: unavailable,
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
});
