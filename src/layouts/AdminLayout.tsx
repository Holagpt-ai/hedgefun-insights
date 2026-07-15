import { Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, CreditCard, BarChart2, Newspaper,
  TrendingUp, Bot, Bell, Settings, ChevronLeft, ChevronRight,
  LogOut, Home, User,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AdminGuard from "@/components/admin/AdminGuard";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/admin" },
  { icon: Users, label: "Users", path: "/admin/users" },
  { icon: CreditCard, label: "Subscriptions", path: "/admin/subscriptions" },
  { icon: BarChart2, label: "Analytics", path: "/admin/analytics" },
  { icon: Newspaper, label: "News Feed", path: "/admin/news" },
  { icon: TrendingUp, label: "Market Data", path: "/admin/market" },
  { icon: Bot, label: "Agentic SEO", path: "/admin/seo" },
  { icon: Bell, label: "Alerts", path: "/admin/alerts" },
  { icon: Settings, label: "Settings", path: "/admin/settings" },
];

function AdminSidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const location = useLocation();

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 transition-all duration-200"
      style={{
        width: collapsed ? 48 : 220,
        background: "#ffffff",
        boxShadow: "1px 0 0 #e2e8f0",
      }}
    >
      <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {!collapsed && <span className="font-bold text-sm" style={{ color: "#0f172a" }}>Stocksist Admin</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-black/5" style={{ color: "#64748b" }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-3 py-2 text-sm transition-colors"
              style={{
                color: active ? "#2563eb" : "#64748b",
                background: active ? "rgba(37,99,235,0.08)" : "transparent",
                borderLeft: active ? "3px solid #2563eb" : "3px solid transparent",
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function AdminHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentNav = navItems.find((n) => location.pathname === n.path || (n.path !== "/admin" && location.pathname.startsWith(n.path)));
  const initials = profile?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "AD";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="h-14 flex items-center justify-between px-6" style={{ boxShadow: "0 1px 0 #e2e8f0", background: "#ffffff" }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: "#64748b" }}>
        <Link to="/admin" style={{ color: "#64748b" }}>Admin</Link>
        {currentNav && currentNav.path !== "/admin" && (
          <>
            <span style={{ color: "#94a3b8" }}>/</span>
            <span style={{ color: "#0f172a" }}>{currentNav.label}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#16a34a" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#16a34a" }} />
          </span>
          <span className="text-xs" style={{ color: "#64748b" }}>System Online</span>
        </div>
        <div className="relative">
          <div
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer"
            style={{ background: "#2563eb", color: "#fff" }}
          >
            {initials}
          </div>
          {menuOpen && (
            <div
              className="absolute right-0 top-10 w-48 rounded-lg shadow-lg border z-50 py-1"
              style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
            >
              <button
                onClick={() => { navigate("/"); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/5 transition-colors"
                style={{ color: "#0f172a" }}
              >
                <Home size={14} />
                View Site
              </button>
              <button
                onClick={() => { navigate("/account"); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/5 transition-colors"
                style={{ color: "#0f172a" }}
              >
                <User size={14} />
                Account
              </button>
              <div style={{ borderTop: "1px solid #e2e8f0", margin: "4px 0" }} />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/5 transition-colors"
                style={{ color: "#f87171" }}
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AdminGuard>
      <div className="flex min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>
        <AdminSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="flex-1 flex flex-col min-w-0">
          <AdminHeader />
          <main className="flex-1 p-6 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}
