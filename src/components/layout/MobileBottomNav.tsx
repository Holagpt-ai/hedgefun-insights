import { Home, Star, SlidersHorizontal, TrendingUp, User, LayoutDashboard } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const baseTabs = [
  { labelKey: "home", icon: Home, route: "/" },
  { labelKey: "watchlist", icon: Star, route: "/dashboard/watchlist" },
  { labelKey: "screener", icon: SlidersHorizontal, route: "/screener" },
  { labelKey: "trending", icon: TrendingUp, route: "/trending" },
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();

  const finalTab = user
    ? { labelKey: "dashboard", icon: LayoutDashboard, route: "/dashboard" }
    : { labelKey: "logIn", icon: User, route: "/login" };

  const tabs = [...baseTabs, finalTab];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 border-t border-border bg-surface-card flex items-center">
      {tabs.map((tab) => {
        const active = location.pathname === tab.route;
        return (
          <button
            key={tab.route}
            onClick={() => navigate(tab.route)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
              active ? "text-accent-blue" : "text-muted-foreground"
            )}
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[0.625rem] font-medium">{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
