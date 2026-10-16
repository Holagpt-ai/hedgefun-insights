import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useRobotsNoIndex } from "@/hooks/useRobotsNoIndex";
import { Header } from "@/components/layout/Header";
import MarketTicker from "@/components/layout/MarketTicker";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";

export default function SmartLayout() {
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();
  useRobotsNoIndex(
    pathname.startsWith("/account") || pathname === "/journal" || pathname.startsWith("/journal/"),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-blue" />
      </div>
    );
  }

  if (user) {
    return (
      <>
        <Header onMenuToggle={() => setMobileNavOpen(true)} />
        <MarketTicker />
        <div className="flex">
          <div className="hidden md:block">
            <DashboardSidebar />
          </div>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[260px] md:hidden h-dvh flex flex-col overflow-y-auto overscroll-contain [&>button]:z-10"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("a")) setMobileNavOpen(false);
            }}
          >
            <div className="flex-1 min-h-0 pb-[env(safe-area-inset-bottom)]">
              <DashboardSidebar forceExpanded />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <Header onMenuToggle={() => setMobileMenuOpen(true)} />
      <div className="flex">
        <AppSidebar />
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      <Footer />
      <MobileBottomNav />
      <MobileSidebarDrawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <ChatWidget />
    </>
  );
}
