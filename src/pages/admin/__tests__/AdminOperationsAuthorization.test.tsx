import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

const rpc = vi.fn();
let authUser: { id: string; email?: string } | null = null;
let authLoading = false;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: authUser, loading: authLoading }) }));

import AdminGuard from "@/components/admin/AdminGuard";

function LoginProbe() {
  const loc = useLocation();
  return <div>login page {loc.search}</div>;
}

function routes() {
  return (
    <Routes>
      <Route path="/" element={<div>public home</div>} />
      <Route path="/login" element={<LoginProbe />} />
      <Route path="/admin/operations" element={<AdminGuard><div>ops center</div></AdminGuard>} />
    </Routes>
  );
}

function renderGuarded(entry = "/admin/operations") {
  return render(<MemoryRouter initialEntries={[entry]}>{routes()}</MemoryRouter>);
}

describe("Operations Control Center authorization (Batch 214 access states)", () => {
  beforeEach(() => {
    rpc.mockReset();
    authLoading = false;
  });

  it("shows a spinner while auth is still loading, without calling the RPC or rendering admin content", () => {
    authLoading = true;
    authUser = null;
    renderGuarded();
    expect(screen.getByRole("status", { name: /checking admin access/i })).toBeTruthy();
    expect(screen.queryByText("ops center")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to login with the admin path preserved, not to the homepage", async () => {
    authUser = null;
    renderGuarded("/admin/operations?tab=scanner");
    const login = await screen.findByText(/login page/);
    expect(login.textContent).toContain("?next=" + encodeURIComponent("/admin/operations?tab=scanner"));
    expect(screen.queryByText("public home")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows Access Denied with the signed-in account for authenticated non-admins", async () => {
    authUser = { id: "11111111-2222-4333-8444-555555555555", email: "member@example.com" };
    rpc.mockResolvedValue({ data: false, error: null });
    renderGuarded();
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.getByText("member@example.com")).toBeTruthy();
    expect(screen.getByTestId("admin-denied-user-id").textContent).toBe("11111111-2222-4333-8444-555555555555");
    expect(screen.queryByText("ops center")).toBeNull();
    expect(screen.queryByText("public home")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "11111111-2222-4333-8444-555555555555", _role: "admin" });
  });

  it("treats non-boolean RPC data as denied (fail closed)", async () => {
    authUser = { id: "u1" };
    rpc.mockResolvedValue({ data: "true", error: null });
    renderGuarded();
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("ops center")).toBeNull();
  });

  it("shows a distinct verification failure (with retry) when the role RPC errors", async () => {
    authUser = { id: "u1" };
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST203", message: "Could not choose the best candidate function" } });
    renderGuarded();
    expect(await screen.findByText("Could not verify admin access")).toBeTruthy();
    expect(screen.getByText(/PGRST203/)).toBeTruthy();
    expect(screen.queryByText("ops center")).toBeNull();
    expect(screen.queryByText("Access denied")).toBeNull();

    rpc.mockResolvedValueOnce({ data: true, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ops center")).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown transport error as a verification failure, never as access", async () => {
    authUser = { id: "u1" };
    rpc.mockRejectedValue(new Error("Failed to fetch"));
    renderGuarded();
    expect(await screen.findByText("Could not verify admin access")).toBeTruthy();
    expect(screen.queryByText("ops center")).toBeNull();
  });

  it("renders admin content only for an explicit true", async () => {
    authUser = { id: "admin" };
    rpc.mockResolvedValue({ data: true, error: null });
    renderGuarded();
    await waitFor(() => expect(screen.getByText("ops center")).toBeTruthy());
  });

  it("does not carry an admin result over to a different signed-in user", async () => {
    authUser = { id: "admin" };
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const view = renderGuarded();
    await screen.findByText("ops center");

    let resolveSecond: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => { resolveSecond = r; }));
    authUser = { id: "someone-else" };
    view.rerender(<MemoryRouter initialEntries={["/admin/operations"]}>{routes()}</MemoryRouter>);
    // While the second check is in flight, the previous user's admin result must not apply.
    expect(screen.queryByText("ops center")).toBeNull();
    await act(async () => resolveSecond({ data: false, error: null }));
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("ops center")).toBeNull();
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
