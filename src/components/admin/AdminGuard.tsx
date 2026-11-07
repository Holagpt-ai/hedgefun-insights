import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { buildLoginPath, currentReturnPath } from "@/lib/auth/auth-return-url";

/**
 * Admin route gate (Batch 214).
 *
 * The role is checked server-side via the SECURITY DEFINER `has_role` RPC
 * against RLS-protected `user_roles`. Every outcome other than an explicit
 * `true` fails closed — admin children never render. The UI makes the
 * failure mode visible instead of silently redirecting to the homepage:
 *
 * - no session            → /login?next=<current admin path>
 * - signed in, not admin  → Access Denied (shows the account so an owner can
 *                           request the role through Lovable Cloud)
 * - role check errored    → "Could not verify" with retry
 *
 * This is presentation only; data protection stays in RLS and in the
 * admin checks inside database functions.
 */

export type AdminRoleCheck =
  | { state: "pending" }
  | { state: "admin" }
  | { state: "denied" }
  | { state: "error"; message: string };

const SHELL: React.CSSProperties = { background: "#f8fafc", color: "#0f172a" };

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={SHELL} role="status" aria-label="Checking admin access">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#2563eb" }} />
    </div>
  );
}

function GateCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={SHELL}>
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#e2e8f0" }}>
        <div className="mb-3 flex items-center gap-2">
          {icon}
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <div className="space-y-3 text-sm" style={{ color: "#334155" }}>{children}</div>
      </div>
    </div>
  );
}

export function AdminAccessDenied({ email, userId }: { email: string | null; userId: string }) {
  return (
    <GateCard icon={<ShieldAlert size={20} color="#b91c1c" />} title="Access denied">
      <p>This account is signed in but does not have the administrator role, so admin pages are not available.</p>
      <dl className="rounded-md border p-3 text-xs" style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}>
        <dt style={{ color: "#64748b" }}>Signed in as</dt>
        <dd className="mb-2 break-all font-medium">{email ?? "(no email on account)"}</dd>
        <dt style={{ color: "#64748b" }}>User ID</dt>
        <dd className="break-all font-mono" data-testid="admin-denied-user-id">{userId}</dd>
      </dl>
      <p className="text-xs" style={{ color: "#64748b" }}>
        Administrator roles are granted only by the project owner through Lovable Cloud. If you signed in with the
        wrong account, sign out and use the administrator account.
      </p>
      <div className="flex gap-3 pt-1">
        <Link to="/" className="text-sm font-medium underline" style={{ color: "#2563eb" }}>Go to homepage</Link>
        <Link to="/account" className="text-sm font-medium underline" style={{ color: "#2563eb" }}>Account</Link>
      </div>
    </GateCard>
  );
}

export function AdminAccessCheckFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <GateCard icon={<AlertTriangle size={20} color="#b45309" />} title="Could not verify admin access">
      <p>The administrator role check did not complete, so admin pages stay locked.</p>
      <p className="rounded-md border p-2 font-mono text-xs break-words" style={{ borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
        {message}
      </p>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onRetry} className="rounded-md border px-3 py-1.5 text-sm font-medium" style={{ borderColor: "#e2e8f0" }}>
          Retry
        </button>
        <Link to="/" className="self-center text-sm font-medium underline" style={{ color: "#2563eb" }}>Go to homepage</Link>
      </div>
    </GateCard>
  );
}

function boundedMessage(error: { message?: string; code?: string } | null | undefined): string {
  const code = error?.code ? `[${String(error.code).slice(0, 12)}] ` : "";
  const msg = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : "Unknown error";
  return `${code}${msg}`.slice(0, 200);
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Result is keyed to the user id it was computed for, so a check for one
  // session can never authorize another (or a later sign-in).
  const [check, setCheck] = useState<{ userId: string; result: AdminRoleCheck } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setCheck({ userId, result: { state: "pending" } });
    (async () => {
      try {
        // Authoritative server-side role check (SECURITY DEFINER has_role over RLS-protected user_roles).
        const { data, error } = await supabase.rpc("has_role" as never, {
          _user_id: userId,
          _role: "admin",
        } as never);
        if (cancelled) return;
        if (error) {
          setCheck({ userId, result: { state: "error", message: boundedMessage(error) } });
        } else {
          setCheck({ userId, result: data === true ? { state: "admin" } : { state: "denied" } });
        }
      } catch (err) {
        if (cancelled) return;
        setCheck({
          userId,
          result: { state: "error", message: boundedMessage({ message: err instanceof Error ? err.message : String(err) }) },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to={buildLoginPath(currentReturnPath(location))} replace />;

  const result: AdminRoleCheck = check && check.userId === user.id ? check.result : { state: "pending" };
  switch (result.state) {
    case "pending":
      return <Spinner />;
    case "admin":
      return <>{children}</>;
    case "denied":
      return <AdminAccessDenied email={user.email ?? null} userId={user.id} />;
    case "error":
      return <AdminAccessCheckFailed message={result.message} onRetry={retry} />;
  }
}
