import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import MarketTicker from "@/components/layout/MarketTicker";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardLayout() {
  const { user, loading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-blue" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header onMenuToggle={() => setMobileNavOpen(true)} />
      <MarketTicker />
      <div className="flex">
        {/* Desktop/tablet sidebar — hidden on mobile so it does not reserve width */}
        <div className="hidden md:block">
          <DashboardSidebar />
        </div>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile-only drawer navigation */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="p-0 w-[260px] md:hidden"
          onClick={(e) => {
            // Close drawer when a nav link inside is tapped
            const target = e.target as HTMLElement;
            if (target.closest("a")) setMobileNavOpen(false);
          }}
        >
          <DashboardSidebar forceExpanded />

        </SheetContent>
      </Sheet>
    </>
  );
}
