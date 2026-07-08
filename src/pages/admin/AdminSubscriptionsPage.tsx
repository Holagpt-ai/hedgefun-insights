import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRICING } from "@/config/pricing";

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

  // Provider-agnostic pricing — sourced from src/config/pricing.ts.
  // No provider price IDs are referenced here.
  const proMonthly = PRICING.pro.monthly;
  const proAnnual = PRICING.pro.annual;

  // MRR estimate: monthly subs pay monthly price; annual subs amortized to per-month.
  const mrr = counts.monthly * proMonthly + counts.annual * (proAnnual / 12);
  const arr = counts.monthly * proMonthly * 12 + counts.annual * proAnnual;

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const metrics = [
    { label: "MRR (est.)", value: fmt(mrr) },
    { label: "ARR (est.)", value: fmt(arr) },
    { label: "Active Subscriptions", value: counts.active },
    { label: "Churn Rate", value: "—" },
  ];

  const priceLabel = (plan: string | null | undefined) => {
    if (plan === "pro_annual") return fmt(proAnnual);
    if (plan === "pro_monthly") return fmt(proMonthly);
    return "$0";
  };

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
          { name: PRICING.free.label, price: `$${PRICING.free.monthly}`, count: "—", features: ["Basic stock data", "10 AI queries/day", "Watchlist (5 stocks)"] },
          { name: `${PRICING.pro.label} Monthly`, price: `$${proMonthly}/mo`, count: counts.monthly, features: ["Real-time data", "Unlimited AI", "Full screener", "Unlimited watchlist"] },
          { name: `${PRICING.pro.label} Annual`, price: `$${proAnnual}/yr`, count: counts.annual, features: ["Everything in Monthly", "Best value", "Priority support"] },
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
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#94a3b8" }} />
          </span>
          <span className="text-sm font-medium">Payment Provider</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(100,116,139,0.1)", color: "#64748b" }}>Not Connected</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(100,116,139,0.1)", color: "#64748b" }}>Provider Integration: Pending</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(100,116,139,0.1)", color: "#64748b" }}>Webhook Status: Not Active</span>
        </div>
        <p className="text-xs" style={{ color: "#64748b" }}>
          No payment provider is wired yet. Subscription rows below reflect manual/internal grants only. Pricing and revenue estimates are computed from the app's pricing config.
        </p>
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
                <td className="py-2" style={{ color: "#64748b" }}>{s.user_id ? String(s.user_id).slice(0, 8) : "—"}</td>
                <td className="py-2">{s.plan || "free"}</td>
                <td className="py-2">{priceLabel(s.plan)}</td>
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
