import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

const rpc = vi.fn();
let authUser: { id: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: authUser, loading: false }) }));

import AdminGuard from "@/components/admin/AdminGuard";

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/admin/operations"]}>
      <Routes>
        <Route path="/" element={<div>public home</div>} />
        <Route path="/admin/operations" element={<AdminGuard><div>ops center</div></AdminGuard>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Operations Control Center authorization", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("redirects signed-out visitors", async () => {
    authUser = null;
    renderGuarded();
    expect(await screen.findByText("public home")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("redirects authenticated non-admins after the server-side has_role check", async () => {
    authUser = { id: "u1" };
    rpc.mockResolvedValue({ data: false, error: null });
    renderGuarded();
    expect(await screen.findByText("public home")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "u1", _role: "admin" });
  });

  it("denies when the role RPC errors", async () => {
    authUser = { id: "u1" };
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    renderGuarded();
    expect(await screen.findByText("public home")).toBeTruthy();
  });

  it("renders for admins", async () => {
    authUser = { id: "admin" };
    rpc.mockResolvedValue({ data: true, error: null });
    renderGuarded();
    await waitFor(() => expect(screen.getByText("ops center")).toBeTruthy());
  });

  it("route is mounted inside the guarded AdminLayout", () => {
    const app = readFileSync(path.resolve(__dirname, "../../../App.tsx"), "utf8");
    const block = app.slice(app.indexOf("<Route element={<AdminLayout />}>"));
    const end = block.indexOf("</Route>");
    expect(block.slice(0, end)).toContain('path="/admin/operations"');
  });

  it("the page source performs no writes or function invocations", () => {
    const files = [
      "../AdminOperationsPage.tsx",
      "../../../lib/ops/sources.ts",
      "../../../hooks/useOperationsSnapshot.ts",
    ].map((f) => readFileSync(path.resolve(__dirname, f), "utf8"));
    for (const src of files) {
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      // The only RPC allowed is the admin-gated, read-only diagnostics read (Batch 213).
      const rpcArgs = [...src.matchAll(/\.rpc\(\s*([^,)]+)/g)].map((m) => m[1].trim());
      for (const arg of rpcArgs) expect(arg).toBe("OPS_DIAGNOSTICS_RPC");
      expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/i);
      expect(src).not.toMatch(/SERVICE_ROLE_KEY|import\.meta\.env\.(?!VITE_VERCEL_GIT_COMMIT_SHA)/);
    }
  });
});
