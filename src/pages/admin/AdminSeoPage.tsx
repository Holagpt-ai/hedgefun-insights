import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const card: React.CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 };

export default function AdminSeoPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, passRate: 0, avgScore: 0 });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("agentic_seo_log").select("*").order("created_at", { ascending: false }).limit(20);
      setLogs(data || []);
      const all = data || [];
      const passed = all.filter((l) => l.audit_passed);
      setStats({
        total: all.length,
        passRate: all.length ? Math.round((passed.length / all.length) * 100) : 0,
        avgScore: all.length ? Math.round(all.reduce((a, l) => a + (l.audit_score || 0), 0) / all.length) : 0,
      });
    })();
  }, []);

  const statCards = [
    { label: "Pages Generated", value: stats.total },
    { label: "Audit Pass Rate", value: `${stats.passRate}%` },
    { label: "Avg Audit Score", value: stats.avgScore },
    { label: "CTS Triggers Today", value: 12 },
  ];

  const sitemaps = [
    { name: "sitemap-core.xml", pages: 24, status: "Healthy" },
    { name: "sitemap-tickers.xml", pages: 503, status: "Healthy" },
    { name: "sitemap-programmatic.xml", pages: 1240, status: "Healthy" },
    { name: "sitemap-reviews.xml", pages: 0, status: "Empty" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Agentic SEO</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} style={card}>
            <p className="text-xs" style={{ color: "#64748b" }}>{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3" style={{ ...card, padding: "12px 20px" }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#16a34a" }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#16a34a" }} />
        </span>
        <span className="text-sm" style={{ color: "#16a34a" }}>Engine Running</span>
        <Button size="sm" className="ml-auto" style={{ background: "#2563eb" }}>▶ Run Manual Batch</Button>
      </div>

      <div style={{ ...card, padding: 0 }} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              {["Ticker", "Page Type", "Generator", "Auditor", "Score", "Status", "Time"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: "#64748b" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td className="px-4 py-3 font-semibold" style={{ color: "#2563eb" }}>{l.symbol}</td>
                <td className="px-4 py-3" style={{ color: "#64748b" }}>{l.page_type}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>{l.generator_model || "—"}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>{l.auditor_model || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ background: "#f1f5f9" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${l.audit_score || 0}%`, background: (l.audit_score || 0) >= 80 ? "#16a34a" : "#dc2626" }} />
                    </div>
                    <span className="text-xs" style={{ color: (l.audit_score || 0) >= 80 ? "#16a34a" : "#dc2626" }}>{l.audit_score}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: l.audit_passed ? "rgba(22,163,106,0.1)" : "rgba(220,38,38,0.1)", color: l.audit_passed ? "#16a34a" : "#dc2626" }}>
                    {l.audit_passed ? "Passed" : "Failed"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-sm font-semibold mb-3">Sitemap Status</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {sitemaps.map((s) => (
            <div key={s.name} style={card}>
              <p className="text-xs font-mono" style={{ color: "#64748b" }}>{s.name}</p>
              <p className="text-lg font-bold mt-1">{s.pages} pages</p>
              <span className="text-xs px-2 py-0.5 rounded mt-2 inline-block" style={{ background: s.status === "Healthy" ? "rgba(22,163,106,0.1)" : "rgba(100,116,139,0.1)", color: s.status === "Healthy" ? "#16a34a" : "#64748b" }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
