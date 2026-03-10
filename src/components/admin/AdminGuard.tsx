import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#020617", color: "#e2e8f0" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#2563eb" }} />
      </div>
    );
  }

  if (!user || profile?.plan !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
