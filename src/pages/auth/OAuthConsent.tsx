import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; redirect_uris?: string[] };
type AuthorizationDetails = {
  client?: OAuthClient;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult<T> = { data: T | null; error: { message: string } | null };
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult<AuthorizationDetails>>;
  approveAuthorization: (id: string) => Promise<OAuthResult<AuthorizationDetails>>;
  denyAuthorization: (id: string) => Promise<OAuthResult<AuthorizationDetails>>;
};

function oauth(): OAuthNamespace {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.auth as any).oauth as OAuthNamespace;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in the request URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      setUserEmail(sess.session.user?.email ?? null);

      const { data, error: fetchError } = await oauth().getAuthorizationDetails(
        authorizationId,
      );
      if (!active) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 space-y-3">
          <h1 className="text-lg font-semibold text-foreground">
            Could not load this authorization request
          </h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </main>
    );
  }

  const clientName = details.client?.name ?? "an application";
  const scopes = details.scopes ?? [];

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Connect {clientName} to Stocksist
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName} will be able to call Stocksist&apos;s enabled tools while
            you are signed in.
          </p>
        </div>

        {userEmail && (
          <div className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{userEmail}</span>
          </div>
        )}

        {scopes.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-1">
              Requested permissions
            </div>
            <ul className="text-sm space-y-1">
              {scopes.map((s) => (
                <li key={s} className="text-foreground">• {s}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This does not bypass Stocksist&apos;s permissions or backend policies.
        </p>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 bg-accent-blue text-white text-sm font-semibold px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border border-border text-sm font-semibold px-4 py-2 rounded-md hover:bg-muted disabled:opacity-60"
          >
            Cancel connection
          </button>
        </div>
      </div>
    </main>
  );
}
