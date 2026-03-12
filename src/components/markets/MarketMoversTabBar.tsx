import { useNavigate, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";

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
    <div className="flex items-center justify-between border-b border-border">
      <div className="flex items-center gap-0">
        {TABS.map((tab) => {
          const active = pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="px-4 py-2.5 text-[0.9375rem] transition-colors relative"
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
      <button className="flex items-center gap-1.5 text-[0.875rem] px-3 py-1.5" style={{ color: "hsl(var(--text-muted))" }}>
        Full Width <Lock className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
