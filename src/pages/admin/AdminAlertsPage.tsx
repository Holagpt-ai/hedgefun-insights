const card: React.CSSProperties = { background: "#0a1628", border: "1px solid #1e293b", borderRadius: 8, padding: 20 };

const alerts = [
  { type: "info", msg: "Market data sync completed successfully", time: "2 min ago" },
  { type: "warning", msg: "Polygon API quota at 35% — monitor usage", time: "15 min ago" },
  { type: "success", msg: "New Pro subscriber: john@example.com", time: "1 hr ago" },
  { type: "error", msg: "SEO batch job failed for TSLA overview page", time: "3 hrs ago" },
];

const colors: Record<string, { bg: string; text: string }> = {
  info: { bg: "rgba(37,99,235,0.15)", text: "#60a5fa" },
  warning: { bg: "rgba(234,179,8,0.15)", text: "#facc15" },
  success: { bg: "rgba(22,163,106,0.15)", text: "#4ade80" },
  error: { bg: "rgba(220,38,38,0.15)", text: "#f87171" },
};

export default function AdminAlertsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Alerts</h1>
      {alerts.map((a, i) => (
        <div key={i} style={{ ...card, borderLeft: `3px solid ${colors[a.type].text}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: colors[a.type].bg, color: colors[a.type].text }}>{a.type}</span>
              <span className="text-sm">{a.msg}</span>
            </div>
            <span className="text-xs" style={{ color: "#64748b" }}>{a.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
