import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { PRICING } from "@/config/pricing";

const statCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "20px",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<{ totalUsers: number; proMembers: number; mrr: number; churnRate: string }>({ totalUsers: 0, proMembers: 0, mrr: 0, churnRate: "—" });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const { count: proMembers } = await supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active");
      setStats({
        totalUsers: totalUsers || 0,
        proMembers: proMembers || 0,
        mrr: (proMembers || 0) * PRICING.pro.monthly,
        churnRate: "—",
      });

      const { data } = await supabase.from("profiles").select("id, full_name, email, plan, created_at").order("created_at", { ascending: false }).limit(10);
      setRecentUsers(data || []);
    })();
  }, []);

  const revenueData = Array.from({ length: 20 }, (_, i) => ({
    day: `Day ${i + 1}`,
    revenue: Math.floor(Math.random() * 500) + 100,
  }));

  const cards = [
    { label: "Total Users", value: stats.totalUsers, change: "+12%" },
    { label: "Pro Members", value: stats.proMembers, change: "+8%" },
    { label: "MRR", value: `$${stats.mrr.toLocaleString()}`, change: "+15%" },
    { label: "Churn Rate", value: `${stats.churnRate}%`, change: "-0.3%" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Overview</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} style={statCardStyle}>
            <p className="text-xs" style={{ color: "#64748b" }}>{c.label}</p>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
            <span className="text-xs" style={{ color: c.change.startsWith("-") ? "#dc2626" : "#16a34a" }}>{c.change} vs last month</span>
          </div>
        ))}
      </div>

      <div style={{ ...statCardStyle }}>
        <p className="text-sm font-semibold mb-4">Revenue (Last 20 Days)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revenueData}>
            <XAxis dataKey="day" tick={false} axisLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a", borderRadius: 6 }} />
            <Bar dataKey="revenue" fill="#2563eb" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={statCardStyle}>
        <p className="text-sm font-semibold mb-3">Plan Distribution</p>
        {[
          { label: "Free", pct: 68, color: "#94a3b8" },
          { label: "Pro Monthly", pct: 24, color: "#2563eb" },
          { label: "Pro Annual", pct: 8, color: "#16a34a" },
        ].map((p) => (
          <div key={p.label} className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span>{p.label}</span>
              <span style={{ color: "#64748b" }}>{p.pct}%</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: "#f1f5f9" }}>
              <div className="h-2 rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
            </div>
          </div>
        ))}
      </div>

      <div style={statCardStyle}>
        <p className="text-sm font-semibold mb-3">Recent Signups</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th className="text-left py-2 font-medium" style={{ color: "#64748b" }}>User</th>
                <th className="text-left py-2 font-medium" style={{ color: "#64748b" }}>Email</th>
                <th className="text-left py-2 font-medium" style={{ color: "#64748b" }}>Plan</th>
                <th className="text-left py-2 font-medium" style={{ color: "#64748b" }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td className="py-2 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: `hsl(${(u.full_name || "U").charCodeAt(0) * 5 % 360}, 60%, 50%)`, color: "#fff" }}>
                      {(u.full_name || "U")[0].toUpperCase()}
                    </div>
                    <span>{u.full_name || "—"}</span>
                  </td>
                  <td className="py-2" style={{ color: "#64748b" }}>{u.email}</td>
                  <td className="py-2">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: u.plan === "pro" ? "rgba(37,99,235,0.1)" : "rgba(100,116,139,0.1)", color: u.plan === "pro" ? "#2563eb" : "#64748b" }}>{u.plan || "free"}</span>
                  </td>
                  <td className="py-2" style={{ color: "#64748b" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
