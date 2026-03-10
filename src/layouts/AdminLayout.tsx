import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen" style={{ background: "hsl(222 47% 11%)", color: "hsl(210 40% 98%)" }}>
      {/* Admin sidebar placeholder */}
      <aside className="hidden md:flex flex-col w-60 border-r" style={{ borderColor: "hsl(215 25% 27%)" }}>
        <div className="p-4 font-display text-lg">Admin</div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 flex items-center px-6 border-b" style={{ borderColor: "hsl(215 25% 27%)" }}>
          <span className="text-sm font-medium">HedgeFun Admin</span>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
