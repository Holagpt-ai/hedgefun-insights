import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import MarketTicker from "@/components/layout/MarketTicker";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { useAuth } from "@/contexts/AuthContext";

export default function SmartLayout() {
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-blue" />
      </div>
    );
  }

  if (user) {
    // Authenticated: dashboard chrome (matches DashboardLayout)
    return (
      <>
        <Header onMenuToggle={() => {}} />
        <MarketTicker />
        <div className="flex">
          <DashboardSidebar />
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </>
    );
  }

  // Unauthenticated: public chrome (matches PublicLayout)
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
