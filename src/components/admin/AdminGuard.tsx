import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  // Show spinner while auth is loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#020617", color: "#e2e8f0" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#2563eb" }} />
      </div>
    );
  }

  // Not logged in at all → redirect
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Logged in but profile not yet loaded → keep spinner
  // This prevents flash of admin content before profile confirms plan
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#020617", color: "#e2e8f0" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#2563eb" }} />
      </div>
    );
  }

  // Profile loaded but not admin → redirect
  if (profile.plan !== "admin") {
    return <Navigate to="/" replace />;
  }

  // Confirmed admin → render
  return <>{children}</>;
}
