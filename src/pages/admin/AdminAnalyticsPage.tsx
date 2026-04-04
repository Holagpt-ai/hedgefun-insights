import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const card: React.CSSProperties = { background: "#334155", border: "1px solid #334155", borderRadius: 8, padding: 20 };

const pageViewData = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  views: Math.floor(Math.random() * 2000) + 500,
}));

const topTickers = [
  { ticker: "AAPL", views: 12450, unique: 8320 },
  { ticker: "NVDA", views: 11200, unique: 7890 },
  { ticker: "TSLA", views: 9800, unique: 6540 },
  { ticker: "MSFT", views: 8700, unique: 5230 },
  { ticker: "PLTR", views: 7300, unique: 4110 },
];

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Analytics</h1>

      <div style={card}>
        <p className="text-sm font-semibold mb-4">Page Views (Last 30 Days)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={pageViewData}>
            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#334155", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6 }} />
            <Line type="monotone" dataKey="views" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div style={card}>
          <p className="text-sm font-semibold mb-3">Top Ticker Pages</p>
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid #334155" }}>
              {["Ticker", "Views", "Unique"].map((h) => <th key={h} className="text-left py-2 font-medium" style={{ color: "#94a3b8" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {topTickers.map((t) => (
                <tr key={t.ticker} style={{ borderBottom: "1px solid #334155" }}>
                  <td className="py-2 font-semibold" style={{ color: "#60a5fa" }}>{t.ticker}</td>
                  <td className="py-2" style={{ color: "#94a3b8" }}>{t.views.toLocaleString()}</td>
                  <td className="py-2" style={{ color: "#94a3b8" }}>{t.unique.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <p className="text-sm font-semibold mb-3">Chatbot Usage</p>
          <div className="space-y-4">
            {[
              { label: "Total Queries", value: "24,580" },
              { label: "Queries Today", value: "342" },
              { label: "Avg Response Time", value: "1.2s" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xs" style={{ color: "#94a3b8" }}>{s.label}</p>
                <p className="text-lg font-bold">{s.value}</p>
              </div>
            ))}
            <div>
              <p className="text-xs mb-2" style={{ color: "#94a3b8" }}>Top Questions</p>
              {["What is a P/E ratio?", "Best stocks to buy now?", "How to read earnings?"].map((q) => (
                <p key={q} className="text-xs py-1" style={{ color: "#94a3b8" }}>• {q}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
