import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { JOURNAL_BASE } from "../nav";

export function JournalLegacyRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={JOURNAL_BASE} replace />;
  return <Navigate to="/trading-journal" replace />;
}
