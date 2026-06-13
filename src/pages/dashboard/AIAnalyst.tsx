import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AIAnalystChat } from "@/components/dashboard/AIAnalystChat";
import { supabase } from "@/integrations/supabase/client";

export default function AIAnalyst() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isPro =
    profile?.plan === "pro" ||
    profile?.plan === "admin" ||
    profile?.plan === "unlimited";

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
      {/* PRO gate overlay */}
      {!isPro && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-background/80 backdrop-blur-sm">
          <div className="text-4xl mb-3">⚡</div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            AI Analyst — PRO Feature
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Your personal AI-powered trading analyst. Get market briefs, setup analysis, earnings breakdowns, and more — all personalized to your trading style.
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="bg-accent-blue text-primary-foreground text-sm font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity duration-200"
          >
            Unlock PRO — $29/month
          </button>
        </div>
      )}

      <AIAnalystChat isPro={isPro} userName={profile?.full_name ?? undefined} />
    </div>
  );
}
