import { useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthModals } from "@/components/auth/AuthModals";
import { useAuth } from "@/contexts/AuthContext";

interface AuthRoutePageProps {
  defaultMode: "login" | "signup";
}

export default function AuthRoutePage({ defaultMode }: AuthRoutePageProps) {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | null>(defaultMode);
  const [closed, setClosed] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  if (closed) return <Navigate to="/dashboard" replace />;

  return (
    <AuthModals
      mode={mode}
      onClose={() => setClosed(true)}
      onSwitch={setMode}
    />
  );
}
