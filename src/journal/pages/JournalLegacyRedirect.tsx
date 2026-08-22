import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { JOURNAL_BASE } from "../nav";

/**
 * Legacy /journal is not a second Journal app.
 * Authenticated users stay in the Vite dashboard.
 * Anonymous users hard-navigate to /trading-journal, which is owned by the
 * separate Next.js public application (external dependency; not implemented here).
 */
export function JournalLegacyRedirect() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    window.location.replace("/trading-journal");
  }, [loading, user]);

  if (loading) return null;
  if (user) return <Navigate to={JOURNAL_BASE} replace />;
  return null;
}
