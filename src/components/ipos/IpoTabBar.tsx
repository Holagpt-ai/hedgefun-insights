import { useLocation, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const tabs = [
  { label: "Recent", route: "/ipos/recent" },
  { label: "Calendar", route: "/ipos/calendar" },
  { label: "Statistics", route: "/ipos/statistics" },
  { label: "News", route: "/ipos/news" },
  { label: "Screener", route: "/ipos/screener" },
];

export function IpoTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route: string) => location.pathname === route;

  return (
    <div className="flex items-center justify-between border-b border-border">
      <div className="flex gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.route}
            onClick={() => navigate(tab.route)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              isActive(tab.route)
                ? "text-accent-blue"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {isActive(tab.route) && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue" />
            )}
          </button>
        ))}
      </div>
      <Button variant="outline" size="sm" className="text-xs gap-1.5 mr-2" onClick={() => navigate("/pro")}>
        <Lock className="h-3 w-3" />
        Full Width
      </Button>
    </div>
  );
}
