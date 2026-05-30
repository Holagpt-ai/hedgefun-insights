import { useState, useEffect } from "react";
import {
  Home, Star, BarChart2, Calendar, Archive, Newspaper, TrendingUp,
  BookOpen, LineChart, Activity, Mail, UserPlus, Wrench, ChevronRight,
  ChevronsLeft, ChevronsRight, BookMarked, Globe,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  labelKey: string;
  icon: React.ElementType;
  route: string;
  children?: { labelKey: string; route: string }[];
}

const navItems: NavItem[] = [
  { labelKey: "home", icon: Home, route: "/" },
  { labelKey: "watchlist", icon: Star, route: "/watchlist" },
  { labelKey: "stockJournal", icon: BookMarked, route: "/journal" },
  {
    labelKey: "stocks", icon: BarChart2, route: "/stocks",
    children: [
      { labelKey: "stockScreener", route: "/screener" },
      { labelKey: "stockExchanges", route: "/stocks/exchanges" },
      { labelKey: "comparisonTool", route: "/stocks/compare" },
      { labelKey: "earningsCalendar", route: "/earnings" },
      { labelKey: "byIndustry", route: "/stocks/industry" },
      { labelKey: "stockLists", route: "/stocks/lists" },
      { labelKey: "topAnalysts", route: "/stocks/analysts" },
      { labelKey: "topStocks", route: "/stocks/top-stocks" },
      { labelKey: "corporateActions", route: "/stocks/corporate-actions" },
    ],
  },
  {
    labelKey: "ipos", icon: Calendar, route: "/ipos",
    children: [
      { labelKey: "recentIpos", route: "/ipos/recent" },
      { labelKey: "ipoCalendar", route: "/ipos/calendar" },
      { labelKey: "ipoStatistics", route: "/ipos/statistics" },
      { labelKey: "ipoNews", route: "/ipos/news" },
      { labelKey: "ipoScreener", route: "/ipos/screener" },
    ],
  },
  {
    labelKey: "etfs", icon: Archive, route: "/etfs",
    children: [
      { labelKey: "etfScreener", route: "/etf/screener" },
      { labelKey: "comparisonTool", route: "/etf/compare" },
      { labelKey: "newLaunches", route: "/etf/list/new" },
      { labelKey: "etfProviders", route: "/etf/provider" },
    ],
  },
  { labelKey: "news", icon: Newspaper, route: "/news" },
  { labelKey: "trending", icon: TrendingUp, route: "/trending" },
  { labelKey: "articles", icon: BookOpen, route: "/articles" },
  { labelKey: "technicalChart", icon: LineChart, route: "/chart" },
  {
    labelKey: "marketMovers", icon: Activity, route: "/markets/gainers",
    children: [
      { labelKey: "topGainers", route: "/markets/gainers" },
      { labelKey: "topLosers", route: "/markets/losers" },
      { labelKey: "mostActive", route: "/markets/active" },
      { labelKey: "preMarket", route: "/markets/premarket" },
      { labelKey: "afterHours", route: "/markets/after-hours" },
    ],
  },
  { labelKey: "marketNewsletter", icon: Mail, route: "/newsletter" },
  { labelKey: "hedgefunPro", icon: UserPlus, route: "/pro" },
  { labelKey: "tools", icon: Wrench, route: "/tools" },
];

const sidebarAnimations: Record<string, string> = {
  home: "sidebar-home-bounce 0.4s ease",
  watchlist: "sidebar-star-spin 0.5s ease",
  stockJournal: "sidebar-book-flip 0.4s ease",
  stocks: "sidebar-bars-dance 0.5s ease",
  trending: "sidebar-chart-rise 0.4s ease",
  marketMovers: "sidebar-activity-pulse 0.4s ease",
  marketNewsletter: "sidebar-mail-shake 0.4s ease",
  tools: "sidebar-tool-spin 0.3s ease",
};

export function AppSidebar({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { user, signOut } = useAuth();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebarCollapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  const isActive = (route: string) => location.pathname === route;
  const isParentActive = (item: NavItem) =>
    isActive(item.route) || item.children?.some((c) => isActive(c.route));

  const handleIconHover = (e: React.MouseEvent, labelKey: string) => {
    const svg = e.currentTarget.querySelector("svg") as SVGElement | null;
    if (svg) svg.style.animation = sidebarAnimations[labelKey] || "none";
  };
  const handleIconLeave = (e: React.MouseEvent) => {
    const svg = e.currentTarget.querySelector("svg") as SVGElement | null;
    if (svg) svg.style.animation = "none";
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-[calc(100vh-var(--header-height))] sticky top-header overflow-y-auto border-r border-border bg-surface-card transition-[width] duration-200 ease-in-out",
        className
      )}
      style={{ width: collapsed ? 52 : 240 }}
    >
      <style>{`
        @keyframes sidebar-home-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes sidebar-star-spin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(20deg) scale(1.1); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes sidebar-book-flip {
          0%, 100% { transform: rotateY(0deg); }
          50% { transform: rotateY(20deg); }
        }
        @keyframes sidebar-bars-dance {
          0%, 100% { transform: scaleY(1); }
          33% { transform: scaleY(1.2); }
          66% { transform: scaleY(0.9); }
        }
        @keyframes sidebar-chart-rise {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(-5deg); }
        }
        @keyframes sidebar-activity-pulse {
          0%, 100% { transform: scaleX(1); }
          50% { transform: scaleX(1.1); }
        }
        @keyframes sidebar-mail-shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-8deg); }
          75% { transform: rotate(8deg); }
        }
        @keyframes sidebar-tool-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(20deg); }
        }
      `}</style>
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {navItems.map((item) =>
          item.children && !collapsed ? (
            <Collapsible key={item.labelKey} defaultOpen={isParentActive(item)}>
              <div
                onMouseEnter={(e) => handleIconHover(e, item.labelKey)}
                onMouseLeave={handleIconLeave}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors group",
                  isParentActive(item)
                    ? "bg-accent-blue-light border-l-[3px] border-accent-blue text-accent-blue"
                    : "text-sidebar-foreground hover:bg-accent"
                )}
              >
                <button
                  onClick={() => navigate(item.route)}
                  className="flex items-center gap-3 flex-1 text-left cursor-pointer"
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{t(item.labelKey)}</span>
                </button>
                <CollapsibleTrigger asChild>
                  <button className="p-0.5 rounded hover:bg-accent cursor-pointer">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="ml-8 space-y-0.5 py-1">
                  {item.children.map((child) => (
                    <button
                      key={child.route}
                      onClick={() => navigate(child.route)}
                      className={cn(
                        "block w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                        isActive(child.route)
                          ? "text-accent-blue font-medium bg-accent-blue-light"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      {t(child.labelKey)}
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <button
              key={item.labelKey}
              onClick={() => navigate(item.route)}
              title={collapsed ? t(item.labelKey) : undefined}
              onMouseEnter={(e) => handleIconHover(e, item.labelKey)}
              onMouseLeave={handleIconLeave}
              className={cn(
                "flex items-center w-full rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
                isActive(item.route) || (item.children && isParentActive(item))
                  ? "bg-accent-blue-light border-l-[3px] border-accent-blue text-accent-blue"
                  : "text-sidebar-foreground hover:bg-accent"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </button>
          )
        )}
      </nav>

      {/* Bottom auth buttons */}
      {!collapsed && (
        <div className="p-3 border-t border-border space-y-2">
          <button
            onClick={() => setLanguage(language === "en" ? "es" : "en")}
            className="md:hidden flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-accent transition-colors"
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span className={language === "en" ? "text-accent-blue font-semibold" : "text-muted-foreground"}>EN</span>
            <span className="text-muted-foreground">|</span>
            <span className={language === "es" ? "text-accent-blue font-semibold" : "text-muted-foreground"}>ES</span>
          </button>
          {user ? (
            <>
              <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => navigate("/account")}>
                {t("myAccount")}
              </Button>
              <Button variant="ghost" className="w-full justify-start text-muted-foreground" size="sm" onClick={signOut}>
                {t("signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button className="w-full bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" size="sm" onClick={() => navigate("/signup")}>
                {t("signUp")}
              </Button>
              <Button variant="outline" className="w-full" size="sm" onClick={() => navigate("/login")}>
                {t("logIn")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex items-center border-t border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer",
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
