import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { createPortalSession } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

  const handleBilling = async () => {
    try {
      const { url } = await createPortalSession();
      if (url) window.location.href = url;
    } catch (e) {
      toast({ title: "Unable to open billing portal", variant: "destructive" });
    }
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
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            profile?.plan === "pro" ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {profile?.plan === "pro" ? "Pro" : "Free"}
          </span>
        </div>
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
        <Button variant="outline" size="sm" className="border-red/50 text-red hover:bg-red-bg">
          Delete Account
        </Button>
      </div>
    </div>
  );
};

export default AccountPage;
