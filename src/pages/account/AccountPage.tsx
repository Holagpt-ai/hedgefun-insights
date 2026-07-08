import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { hasProAccess } from "@/lib/entitlement";

const AccountPage = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({ title: "You're now on HedgeFun Pro. Welcome!" });
    }
  }, [searchParams]);

  if (loading || !user) return null;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.[0]?.toUpperCase() ?? "U";

  const handleBilling = () => {
    toast({
      title: "Coming Soon",
      description: "Payment processing is being set up. Contact info@hedgefun.fun for early Pro access.",
    });
  };

  const handleLanguageChange = async (lang: "en" | "es") => {
    setLanguage(lang);
    await supabase.from("profiles").update({ preferred_language: lang }).eq("id", user.id);
  };

  const handleThemeChange = async () => {
    toggleTheme();
    const newTheme = theme === "light" ? "dark" : "light";
    await supabase.from("profiles").update({ preferred_theme: newTheme }).eq("id", user.id);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-lg font-bold text-foreground">Account Settings</h1>

      {/* Profile */}
      <div className="fintech-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Profile</h2>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-accent-blue to-accent-blue-hover flex items-center justify-center text-lg font-bold text-primary-foreground">
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{profile?.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{profile?.email ?? user.email}</p>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="fintech-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Subscription</h2>
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            hasProAccess(profile?.plan) ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {hasProAccess(profile?.plan) ? "Pro" : "Free"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Self-service billing isn't connected yet. If you'd like Pro access before it goes live, email{" "}
          <a href="mailto:info@hedgefun.fun" className="underline">info@hedgefun.fun</a> and we'll onboard you manually.
        </p>
        <Button variant="outline" size="sm" onClick={handleBilling}>Manage Billing</Button>
      </div>


      {/* Preferences */}
      <div className="fintech-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Preferences</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Language</span>
            <div className="flex gap-1">
              <button onClick={() => handleLanguageChange("en")} className={cn("text-xs px-3 py-1 rounded-full", language === "en" ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground")}>EN</button>
              <button onClick={() => handleLanguageChange("es")} className={cn("text-xs px-3 py-1 rounded-full", language === "es" ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground")}>ES</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Theme</span>
            <button onClick={handleThemeChange} className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">
              {theme === "light" ? "☀ Light" : "☾ Dark"}
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="fintech-card p-4 border-red/30">
        <h2 className="text-sm font-semibold text-red mb-2">Danger Zone</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Account deletion isn't available yet. To request deletion, email{" "}
          <a href="mailto:info@hedgefun.fun" className="underline">info@hedgefun.fun</a>.
        </p>
        <Button variant="outline" size="sm" disabled className="border-red/50 text-red">
          Delete Account (coming soon)
        </Button>
      </div>

    </div>
  );
};

export default AccountPage;
