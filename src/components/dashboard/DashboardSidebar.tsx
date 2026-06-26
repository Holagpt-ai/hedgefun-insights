import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Compass, Sun, Moon, BarChart2, Sparkles, Star, BookOpen, Gamepad2,
  Bell, Newspaper, MessageSquare, Settings, CreditCard, LifeBuoy,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

type NavEntry =
  | { section: string }
  | {
      label: string;
      icon: React.ReactNode;
      route: string | null;
      plan?: "free" | "pro";
      locked?: "soon";
    };

const NAV: NavEntry[] = [
  { label: "Browse Stocks", icon: <Compass className="h-4 w-4" />, route: "/", plan: "free" },
  { section: "Main" },
  { label: "AM Inbox",      icon: <Sun className="h-4 w-4" />,        route: "/dashboard/am",        plan: "pro" },
  { label: "PM Inbox",      icon: <Moon className="h-4 w-4" />,       route: "/dashboard/pm",        plan: "pro" },
  { label: "Screeners",     icon: <BarChart2 className="h-4 w-4" />,  route: "/dashboard/screeners", plan: "free" },
  { label: "AI Analyst",    icon: <Sparkles className="h-4 w-4" />,   route: "/dashboard/ai",        plan: "free" },
  { label: "My Watchlist",  icon: <Star className="h-4 w-4" />,       route: "/dashboard/watchlist",           plan: "free" },
  { label: "Stock Journal", icon: <BookOpen className="h-4 w-4" />,   route: "/dashboard/journal",   plan: "pro" },
  { label: "HedgeFun Game", icon: <Gamepad2 className="h-4 w-4" />,   route: "/dashboard/game",      plan: "free" },
  { section: "Phase 2" },
  { label: "Price Alerts",  icon: <Bell className="h-4 w-4" />,        route: null, locked: "soon" },
  { label: "News Feed",     icon: <Newspaper className="h-4 w-4" />,   route: null, locked: "soon" },
  { label: "Community",     icon: <MessageSquare className="h-4 w-4" />, route: null, locked: "soon" },
  { section: "Account" },
  { label: "Account Settings", icon: <Settings className="h-4 w-4" />,    route: "/account",         plan: "free" },
  { label: "Manage Billing",   icon: <CreditCard className="h-4 w-4" />,  route: "/account/billing", plan: "free" },
  { label: "Get Support",      icon: <LifeBuoy className="h-4 w-4" />,    route: "/support",         plan: "free" },
];

export default function DashboardSidebar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("dashboardSidebarCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("dashboardSidebarCollapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  const isPro = profile?.plan === "pro" || profile?.plan === "unlimited" || profile?.plan === "admin";

  const openUpgrade = () => setUpgradeOpen(true);

  return (
    <aside
      className="shrink-0 border-r border-border bg-surface-card overflow-y-auto transition-[width] duration-200 ease-in-out flex flex-col"
      style={{ width: collapsed ? 52 : 220, minHeight: "calc(100vh - 64px)" }}
    >
      <nav className="py-4 px-2 space-y-1">
        {NAV.map((entry, i) => {
          if ("section" in entry) {
            if (collapsed) {
              return <div key={`s-${i}`} className="h-2" aria-hidden />;
            }
            return (
              <div
                key={`s-${i}`}
                className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {entry.section}
              </div>
            );
          }

          const active = entry.route ? pathname === entry.route : false;
          const isLocked = entry.locked === "soon";
          const requiresUpgrade = entry.plan === "pro" && !isPro;

          const baseClass = cn(
            "flex items-center rounded-md text-sm transition-colors",
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
            active
              ? "bg-accent-blue-light border-l-[3px] border-accent-blue text-accent-blue font-medium"
              : "text-foreground hover:bg-muted/50",
            isLocked && "opacity-60 cursor-not-allowed",
          );

          const content = (
            <>
              <span className="flex-shrink-0">{entry.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{entry.label}</span>
                  {isLocked && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      Soon
                    </span>
                  )}
                  {requiresUpgrade && !isLocked && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-blue text-primary-foreground">
                      PRO
                    </span>
                  )}
                </>
              )}
            </>
          );

          const tooltip = collapsed ? entry.label : undefined;

          if (isLocked) {
            return (
              <div key={entry.label} className={baseClass} title={tooltip}>
                {content}
              </div>
            );
          }

          if (requiresUpgrade) {
            return (
              <button
                key={entry.label}
                type="button"
                onClick={openUpgrade}
                title={tooltip}
                className={cn(baseClass, "w-full text-left")}
              >
                {content}
              </button>
            );
          }

          return (
            <NavLink key={entry.label} to={entry.route!} className={baseClass} title={tooltip}>
              {content}
            </NavLink>
          );
        })}

        {!isPro && !collapsed && (
          <div className="mt-6 mx-2 p-3 rounded-lg border border-border bg-accent-blue-light/40">
            <p className="text-xs text-foreground mb-2 leading-snug">
              Unlock AM/PM Inbox, AI Analyst, Stock Journal and more.
            </p>
            <Button
              size="sm"
              className="w-full bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
              onClick={openUpgrade}
            >
              Upgrade to PRO
            </Button>
          </div>
        )}
      </nav>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock HedgeFun PRO</DialogTitle>
            <DialogDescription>
              Get the AM/PM Inbox, AI Analyst, Stock Journal, and the full PRO toolkit for $5/month.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Close
            </Button>
            <Button
              className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
              onClick={() => {
                setUpgradeOpen(false);
                navigate("/pro");
              }}
            >
              See PRO plans
            </Button>
          </DialogFooter>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Or unlock everything with Unlimited for just $10/month.
          </p>
        </DialogContent>
      </Dialog>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "mt-auto flex items-center border-t border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer",
          collapsed ? "justify-center px-3 py-3" : "gap-2 px-4 py-3"
        )}
      >
        {collapsed ? (
          <ChevronsRight className="h-4 w-4 shrink-0" />
        ) : (
          <>
            <ChevronsLeft className="h-4 w-4 shrink-0" />
            <span className="text-sm">Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}
