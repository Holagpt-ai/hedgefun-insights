import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sun, Moon, BarChart2, Sparkles, Star, BookOpen, Gamepad2,
  Bell, Newspaper, MessageSquare, Settings, CreditCard, LifeBuoy,
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
  { section: "Main" },
  { label: "AM Inbox",      icon: <Sun className="h-4 w-4" />,        route: "/dashboard/am",        plan: "pro" },
  { label: "PM Inbox",      icon: <Moon className="h-4 w-4" />,       route: "/dashboard/pm",        plan: "pro" },
  { label: "Screeners",     icon: <BarChart2 className="h-4 w-4" />,  route: "/dashboard/screeners", plan: "free" },
  { label: "AI Analyst",    icon: <Sparkles className="h-4 w-4" />,   route: "/dashboard/ai",        plan: "pro" },
  { label: "My Watchlist",  icon: <Star className="h-4 w-4" />,       route: "/watchlist",           plan: "free" },
  { label: "Stock Journal", icon: <BookOpen className="h-4 w-4" />,   route: "/journal",             plan: "pro" },
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

  const isPro = profile?.plan === "pro" || profile?.plan === "unlimited" || profile?.plan === "admin";

  const openUpgrade = () => setUpgradeOpen(true);

  return (
    <aside
      className="w-[220px] shrink-0 border-r border-border bg-surface-card overflow-y-auto"
      style={{ minHeight: "calc(100vh - 64px)" }}
    >
      <nav className="py-4 px-2 space-y-1">
        {NAV.map((entry, i) => {
          if ("section" in entry) {
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
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            active
              ? "bg-accent-blue-light border-l-[3px] border-accent-blue text-accent-blue font-medium"
              : "text-foreground hover:bg-muted/50",
            isLocked && "opacity-60 cursor-not-allowed",
          );

          const content = (
            <>
              <span className="flex-shrink-0">{entry.icon}</span>
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
          );

          if (isLocked) {
            return (
              <div key={entry.label} className={baseClass}>
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
                className={cn(baseClass, "w-full text-left")}
              >
                {content}
              </button>
            );
          }

          return (
            <NavLink key={entry.label} to={entry.route!} className={baseClass}>
              {content}
            </NavLink>
          );
        })}

        {!isPro && (
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
              Get the AM/PM Inbox, AI Analyst, Stock Journal, and the full PRO toolkit for $29/month.
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
        </DialogContent>
      </Dialog>
    </aside>
  );
}
