import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AIAnalystChat } from "@/components/dashboard/AIAnalystChat";
import { supabase } from "@/integrations/supabase/client";
import { hasProAccess } from "@/lib/entitlement";

export default function AIAnalyst() {
  const { user, profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);

  // Activity log — fire-and-forget, non-blocking
  useEffect(() => {
    if (!user) return;
    supabase
      .from("ai_daily_logs")
      .insert({
        user_id: user.id,
        entry_type: "section_view",
        payload: { section: "ai_analyst" },
      })
      .then(
        () => {},
        () => {}
      );
  }, [user]);

  return (
    <div className="relative h-[calc(100vh-8rem)] w-full">
      <AIAnalystChat
        isPro={isPro}
        userName={profile?.full_name ?? undefined}
        userPlan={profile?.plan ?? "free"}
      />
    </div>
  );
}
