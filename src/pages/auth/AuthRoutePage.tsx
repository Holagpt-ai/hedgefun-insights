import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AuthModals } from "@/components/auth/AuthModals";
import { useAuth } from "@/contexts/AuthContext";

interface AuthRoutePageProps {
  defaultMode: "login" | "signup";
}

// Only allow same-origin relative paths for post-auth redirect.
function safeNext(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export default function AuthRoutePage({ defaultMode }: AuthRoutePageProps) {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const nextTarget = safeNext(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "signup" | null>(defaultMode);
  const [closed, setClosed] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to={nextTarget} replace />;
  if (closed) return <Navigate to="/" replace />;

  return (
    <AuthModals
      mode={mode}
      onClose={() => setClosed(true)}
      onSwitch={setMode}
    />
  );
}
