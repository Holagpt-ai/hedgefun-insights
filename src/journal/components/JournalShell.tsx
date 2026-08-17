import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import "../journal.css";
import { useJournalT, type JournalMessageKey } from "../i18n";
import { validateSymbol } from "../calc";
import { JOURNAL_BASE, JOURNAL_NAV, navItemIsActive } from "../nav";
import { JournalWorkspaceProvider } from "../workspace/JournalWorkspace";
import { DemoBanner } from "./DemoBanner";
import { JournalContextBar } from "./JournalContextBar";

function JournalNavList() {
  const t = useJournalT();
  const location = useLocation();
  return (
    <nav aria-label={t("nav.mobileMenu")}>
      {JOURNAL_NAV.map((group) => (
        <div key={group.id}>
          <div className="journal-nav-section">{t(group.i18nKey as JournalMessageKey)}</div>
          {group.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              data-active={navItemIsActive(location.pathname, location.search, item.path)}
              className="journal-nav-item"
            >
              {t(item.i18nKey as JournalMessageKey)}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function JournalShellInner() {
  const t = useJournalT();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const raw = searchParams.get("symbol");
    if (raw === null) return;
    const symbol = validateSymbol(raw);
    if (symbol) {
      navigate(`${JOURNAL_BASE}/trades/new?symbol=${encodeURIComponent(symbol)}`, { replace: true });
      return;
    }
    navigate({ pathname: window.location.pathname, search: "" }, { replace: true });
  }, [searchParams, navigate]);
  return (
    <div className="journal-root min-h-full">
      <div className="journal-page space-y-3">
        <div className="flex items-center justify-between gap-2 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" aria-label={t("nav.mobileMenu")}>
                <Menu className="h-4 w-4" />
                {t("nav.mobileMenu")}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <JournalNavList />
            </SheetContent>
          </Sheet>
        </div>
        <DemoBanner />
        <JournalContextBar />
        <Outlet />
      </div>
    </div>
  );
}

export function JournalShell() {
  return (
    <JournalWorkspaceProvider>
      <JournalShellInner />
    </JournalWorkspaceProvider>
  );
}
