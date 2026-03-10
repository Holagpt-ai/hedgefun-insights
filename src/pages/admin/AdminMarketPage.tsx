import { Button } from "@/components/ui/button";

const card: React.CSSProperties = { background: "#0a1628", border: "1px solid #1e293b", borderRadius: 8, padding: 20 };

const dataTypes = [
  { name: "Stocks", lastSync: "2 min ago", status: "ok" },
  { name: "Movers", lastSync: "5 min ago", status: "ok" },
  { name: "Indexes", lastSync: "1 min ago", status: "ok" },
  { name: "News", lastSync: "10 min ago", status: "ok" },
];

export default function AdminMarketPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Market Data</h1>

      <div style={card}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm font-semibold">Polygon.io Connection</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#16a34a" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#16a34a" }} />
          </span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(22,163,106,0.2)", color: "#4ade80" }}>Connected</span>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "#64748b" }}>
          <span>API Quota:</span>
          <div className="w-40 h-2 rounded-full" style={{ background: "#1e293b" }}>
            <div className="h-2 rounded-full" style={{ width: "35%", background: "#2563eb" }} />
          </div>
          <span>350 / 1,000 requests today</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dataTypes.map((d) => (
          <div key={d.name} style={card} className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{d.name}</p>
              <p className="text-xs mt-1" style={{ color: "#64748b" }}>Last sync: {d.lastSync}</p>
            </div>
            <Button size="sm" variant="outline" style={{ borderColor: "#1e293b", color: "#94a3b8" }}>
              Force Sync
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
