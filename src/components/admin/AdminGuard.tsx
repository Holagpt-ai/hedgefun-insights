import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: "#020617", color: "#e2e8f0" }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#2563eb" }} />
    </div>
  );
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [roleChecked, setRoleChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) {
        setRoleChecked(true);
        setIsAdmin(false);
        return;
      }
      // Authoritative server-side role check via user_roles (RLS-protected) using has_role RPC
      const { data, error } = await supabase.rpc("has_role" as any, {
        _user_id: user.id,
        _role: "admin",
      });
      if (cancelled) return;
      setIsAdmin(!error && data === true);
      setRoleChecked(true);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && !roleChecked)) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
