import { Outlet, Navigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardLayout() {
  const { user, loading } = useAuth();

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
      <Header onMenuToggle={() => {}} />
      <div className="flex">
        <DashboardSidebar />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </>
  );
}
