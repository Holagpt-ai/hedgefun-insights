import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { JOURNAL_BASE } from "../nav";

/**
 * Legacy /journal is not a second Journal app.
 * Authenticated users stay in the Vite dashboard.
 * Anonymous users are sent to sign-in with a return path back to /journal,
 * which then forwards them into the authenticated Journal after login.
 */
export function JournalLegacyRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to={JOURNAL_BASE} replace />;
  return <Navigate to="/login?next=%2Fjournal" replace />;
}
