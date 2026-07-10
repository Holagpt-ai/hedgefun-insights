import { Home, Star, SlidersHorizontal, TrendingUp, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const tabs = [
  { labelKey: "home", icon: Home, route: "/" },
  { labelKey: "watchlist", icon: Star, route: "/dashboard/watchlist" },
  { labelKey: "screener", icon: SlidersHorizontal, route: "/screener" },
  { labelKey: "trending", icon: TrendingUp, route: "/trending" },
  { labelKey: "account", icon: User, route: "/account" },
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

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
