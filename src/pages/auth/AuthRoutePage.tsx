import { useState } from "react";
import { useRobotsNoIndex } from "@/hooks/useRobotsNoIndex";
import { Navigate, useSearchParams } from "react-router-dom";
import { AuthModals } from "@/components/auth/AuthModals";
import { useAuth } from "@/contexts/AuthContext";
import { sanitizeAuthRedirectPath } from "@/lib/auth/safe-auth-redirect";

interface AuthRoutePageProps {
  defaultMode: "login" | "signup";
}

export default function AuthRoutePage({ defaultMode }: AuthRoutePageProps) {
  useRobotsNoIndex(true);
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const nextTarget = sanitizeAuthRedirectPath(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "signup" | null>(defaultMode);
  const [closed, setClosed] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to={nextTarget} replace />;
  if (closed) return <Navigate to="/" replace />;

  return (
    <AuthModals
      mode={mode}
      redirectAfterAuth={nextTarget}
      onClose={() => setClosed(true)}
      onSwitch={setMode}
    />
  );
}
