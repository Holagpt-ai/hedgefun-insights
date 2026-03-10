import {
  Home, Star, BarChart2, Calendar, Archive, Newspaper, TrendingUp,
  BookOpen, LineChart, Activity, Mail, UserPlus, Wrench, ChevronRight,
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
      { labelKey: "upcomingIpos", route: "/ipos/upcoming" },
      { labelKey: "spacList", route: "/ipos/spac" },
    ],
  },
  {
    labelKey: "etfs", icon: Archive, route: "/etfs",
    children: [
      { labelKey: "etfScreener", route: "/etfs/screener" },
      { labelKey: "topEtfs", route: "/etfs/top" },
      { labelKey: "etfCompare", route: "/etfs/compare" },
    ],
  },
  { labelKey: "news", icon: Newspaper, route: "/news" },
  { labelKey: "trending", icon: TrendingUp, route: "/trending" },
  { labelKey: "articles", icon: BookOpen, route: "/articles" },
  { labelKey: "technicalChart", icon: LineChart, route: "/chart" },
  {
    labelKey: "marketMovers", icon: Activity, route: "/movers",
    children: [
      { labelKey: "topGainers", route: "/movers/gainers" },
      { labelKey: "topLosers", route: "/movers/losers" },
      { labelKey: "mostActive", route: "/movers/active" },
      { labelKey: "preMarket", route: "/movers/premarket" },
      { labelKey: "afterHours", route: "/movers/afterhours" },
    ],
  },
  { labelKey: "marketNewsletter", icon: Mail, route: "/newsletter" },
  { labelKey: "hedgefunPro", icon: UserPlus, route: "/pro" },
  { labelKey: "tools", icon: Wrench, route: "/tools" },
];

export function AppSidebar({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, signOut } = useAuth();

  const isActive = (route: string) => location.pathname === route;
  const isParentActive = (item: NavItem) =>
    isActive(item.route) || item.children?.some((c) => isActive(c.route));

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col w-sidebar h-[calc(100vh-var(--header-height))] sticky top-header overflow-y-auto border-r border-border bg-surface-card",
        className
      )}
    >
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {navItems.map((item) =>
          item.children ? (
            <Collapsible key={item.labelKey} defaultOpen={isParentActive(item)}>
              <CollapsibleTrigger className="w-full">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors group",
                    isParentActive(item)
                      ? "bg-accent-blue-light border-l-[3px] border-accent-blue text-accent-blue"
                      : "text-sidebar-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{t(item.labelKey)}</span>
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
                </div>
              </CollapsibleTrigger>
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
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive(item.route)
                  ? "bg-accent-blue-light border-l-[3px] border-accent-blue text-accent-blue"
                  : "text-sidebar-foreground hover:bg-accent"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{t(item.labelKey)}</span>
            </button>
          )
        )}
      </nav>

      {/* Bottom auth buttons */}
      <div className="p-3 border-t border-border space-y-2">
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
    </aside>
  );
}
