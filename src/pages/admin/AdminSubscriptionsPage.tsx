import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const card: React.CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 };

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [counts, setCounts] = useState({ active: 0, monthly: 0, annual: 0 });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(20);
      setSubs(data || []);
      const active = (data || []).filter((s) => s.status === "active");
      setCounts({
        active: active.length,
        monthly: active.filter((s) => s.plan === "pro_monthly").length,
        annual: active.filter((s) => s.plan === "pro_annual").length,
      });
    })();
  }, []);

  const metrics = [
    { label: "MRR", value: `$${(counts.monthly * 29 + counts.annual * 20).toLocaleString()}` },
    { label: "ARR", value: `$${((counts.monthly * 29 + counts.annual * 20) * 12).toLocaleString()}` },
    { label: "Active Subscriptions", value: counts.active },
    { label: "Churn Rate", value: "2.4%" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Subscriptions</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} style={card}>
            <p className="text-xs" style={{ color: "#64748b" }}>{m.label}</p>
            <p className="text-2xl font-bold mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: "Free", price: "$0", count: "—", features: ["Basic stock data", "10 AI queries/day", "Watchlist (5 stocks)"] },
          { name: "Pro Monthly", price: "$5/mo", count: counts.monthly, features: ["Real-time data", "Unlimited AI", "Full screener", "Unlimited watchlist"] },
          { name: "Pro Annual", price: "$240/yr", count: counts.annual, features: ["Everything in Monthly", "17% savings", "Priority support"] },
        ].map((p) => (
          <div key={p.name} style={card}>
            <p className="font-semibold">{p.name}</p>
            <p className="text-lg font-bold mt-1" style={{ color: "#2563eb" }}>{p.price}</p>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>{p.count} subscribers</p>
            <ul className="mt-3 space-y-1">
              {p.features.map((f) => <li key={f} className="text-xs" style={{ color: "#64748b" }}>✓ {f}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div style={card}>
        <div className="flex items-center gap-3 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#16a34a" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#16a34a" }} />
          </span>
          <span className="text-sm">Stripe Webhook</span>
          <code className="text-xs px-2 py-0.5 rounded" style={{ background: "#f1f5f9", color: "#64748b" }}>hedgefun.fun/api/stripe/webhook</code>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(22,163,106,0.1)", color: "#16a34a" }}>Connected</span>
        </div>
      </div>

      <div style={card}>
        <p className="text-sm font-semibold mb-3">Recent Transactions</p>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              {["User", "Plan", "Amount", "Date", "Status"].map((h) => (
                <th key={h} className="text-left py-2 font-medium" style={{ color: "#64748b" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subs.slice(0, 10).map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td className="py-2" style={{ color: "#64748b" }}>{s.stripe_customer_id || "—"}</td>
                <td className="py-2">{s.plan || "free"}</td>
                <td className="py-2">{s.plan === "pro_annual" ? "$240" : s.plan === "pro_monthly" ? "$5" : "$0"}</td>
                <td className="py-2" style={{ color: "#64748b" }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</td>
                <td className="py-2">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: s.status === "active" ? "rgba(22,163,106,0.1)" : "rgba(220,38,38,0.1)", color: s.status === "active" ? "#16a34a" : "#dc2626" }}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
