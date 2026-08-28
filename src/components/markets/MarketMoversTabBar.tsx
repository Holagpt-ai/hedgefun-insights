import { useNavigate, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  MOVERS_FULL_WIDTH_CLASS,
  MOVERS_TAB_BAR_CLASS,
  MOVERS_TAB_BUTTON_CLASS,
  MOVERS_TABLIST_CLASS,
} from "@/components/markets/movers-responsive";

const TABS = [
  { label: "Gainers", path: "/markets/gainers" },
  { label: "Losers", path: "/markets/losers" },
  { label: "Active", path: "/markets/active" },
  { label: "Premarket", path: "/markets/premarket" },
  { label: "After Hours", path: "/markets/after-hours" },
];

export function MarketMoversTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className={MOVERS_TAB_BAR_CLASS}>
      <div
        role="tablist"
        aria-label="Market movers views"
        className={MOVERS_TABLIST_CLASS}
      >
        {TABS.map((tab) => {
          const active = pathname === tab.path;
          return (
            <button
              key={tab.path}
              role="tab"
              aria-selected={active}
              onClick={() => navigate(tab.path)}
              className={MOVERS_TAB_BUTTON_CLASS}
              style={{
                fontWeight: active ? 700 : 400,
                color: active ? "hsl(var(--text-primary))" : "hsl(var(--text-secondary))",
              }}
            >
              {tab.label}
              {active && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: "hsl(var(--text-primary))" }}
                />
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => navigate("/pro")}
        className={MOVERS_FULL_WIDTH_CLASS}
        style={{ color: "hsl(var(--text-muted))" }}
      >
        Full Width <Lock className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
