import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { AdBanner } from "@/components/layout/AdBanner";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { ChatWidget } from "@/components/chatbot/ChatWidget";

export default function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <Header onMenuToggle={() => setMobileMenuOpen(true)} />
      <AdBanner />
      <div className="flex">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
      <MobileSidebarDrawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <ChatWidget />
    </>
  );
}
