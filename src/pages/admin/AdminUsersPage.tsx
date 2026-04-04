import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const cardStyle: React.CSSProperties = { background: "#1e293b", border: "1px solid #334155", borderRadius: 8 };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
      if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
      const { data } = await query;
      setUsers(data || []);
    })();
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        <Button size="sm" style={{ background: "#2563eb" }}>+ Invite User</Button>
      </div>
      <Input
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        style={{ background: "#1e293b", borderColor: "#334155", color: "#e2e8f0" }}
      />
      <div style={cardStyle} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["User", "Email", "Plan", "Joined", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: "#94a3b8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="transition-colors" style={{ borderBottom: "1px solid #334155" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1f3d")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="px-4 py-3 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: `hsl(${(u.full_name || "U").charCodeAt(0) * 7 % 360}, 55%, 50%)`, color: "#fff" }}>
                    {(u.full_name || "U")[0].toUpperCase()}
                  </div>
                  <span className="truncate">{u.full_name || "—"}</span>
                </td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{u.email}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: u.plan === "admin" ? "rgba(220,38,38,0.2)" : u.plan === "pro" ? "rgba(37,99,235,0.2)" : "rgba(100,116,139,0.2)", color: u.plan === "admin" ? "#f87171" : u.plan === "pro" ? "#60a5fa" : "#94a3b8" }}>
                    {u.plan || "free"}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(22,163,106,0.2)", color: "#4ade80" }}>
                    {u.subscription_status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="text-xs mr-2" style={{ color: "#60a5fa" }}>View</button>
                  <button className="text-xs" style={{ color: "#94a3b8" }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
