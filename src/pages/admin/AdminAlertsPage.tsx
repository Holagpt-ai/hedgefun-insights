const card: React.CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 };

const alerts = [
  { type: "info", msg: "Market data sync completed successfully", time: "2 min ago" },
  { type: "warning", msg: "Polygon API quota at 35% — monitor usage", time: "15 min ago" },
  { type: "success", msg: "New Pro subscriber: john@example.com", time: "1 hr ago" },
  { type: "error", msg: "SEO batch job failed for TSLA overview page", time: "3 hrs ago" },
];

const colors: Record<string, { bg: string; text: string }> = {
  info: { bg: "rgba(37,99,235,0.08)", text: "#2563eb" },
  warning: { bg: "rgba(234,179,8,0.08)", text: "#ca8a04" },
  success: { bg: "rgba(22,163,106,0.08)", text: "#16a34a" },
  error: { bg: "rgba(220,38,38,0.08)", text: "#dc2626" },
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
