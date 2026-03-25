import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthModals } from "@/components/auth/AuthModals";

interface AuthRoutePageProps {
  defaultMode: "login" | "signup";
}

export default function AuthRoutePage({ defaultMode }: AuthRoutePageProps) {
  const [mode, setMode] = useState<"login" | "signup" | null>(defaultMode);
  const [closed, setClosed] = useState(false);

  if (closed) return <Navigate to="/" replace />;

  return (
    <AuthModals
      mode={mode}
      onClose={() => setClosed(true)}
      onSwitch={setMode}
    />
  );
}
