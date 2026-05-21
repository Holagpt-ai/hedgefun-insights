import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const card: React.CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 };

const colors: Record<string, { bg: string; text: string }> = {
  info: { bg: "rgba(37,99,235,0.08)", text: "#2563eb" },
  warning: { bg: "rgba(234,179,8,0.08)", text: "#ca8a04" },
  success: { bg: "rgba(22,163,106,0.08)", text: "#16a34a" },
  error: { bg: "rgba(220,38,38,0.08)", text: "#dc2626" },
};

interface Alert {
  type: "info" | "warning" | "success" | "error";
  msg: string;
  time: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAlerts() {
      const generated: Alert[] = [];

      // Check latest news sync
      const { data: news } = await supabase
        .from("market_news")
        .select("published_at")
        .order("published_at", { ascending: false })
        .limit(1);

      if (news && news.length > 0) {
        generated.push({
          type: "info",
          msg: `Market news sync completed — latest article from ${timeAgo(news[0].published_at ?? "")}`,
          time: timeAgo(news[0].published_at ?? ""),
        });
      } else {
        generated.push({
          type: "warning",
          msg: "Market news table returned no results — sync may be stalled",
          time: "now",
        });
      }

      // Check recent Pro subscribers
      const { data: proUsers } = await supabase
        .from("profiles")
        .select("created_at, plan")
        .eq("plan", "pro")
        .order("created_at", { ascending: false })
        .limit(3);

      if (proUsers && proUsers.length > 1) {
        proUsers.forEach((u) => {
          generated.push({
            type: "success",
            msg: `New Pro subscriber joined`,
            time: timeAgo(u.created_at ?? ""),
          });
        });
      }

      // Check total user count
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      if (userCount !== null) {
        generated.push({
          type: "info",
          msg: `Total registered users: ${userCount.toLocaleString()}`,
          time: "now",
        });
      }

      // Check for admin users
      const { count: adminCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("plan", "admin");

      if (adminCount !== null && adminCount > 0) {
        generated.push({
          type: "info",
          msg: `Admin accounts active: ${adminCount}`,
          time: "now",
        });
      }

      setAlerts(generated.length > 0 ? generated : [{ type: "info", msg: "No alerts at this time.", time: "now" }]);
      setLoading(false);
    }

    loadAlerts();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Alerts</h1>
      {loading ? (
        <div className="text-sm text-gray-500">Loading alerts...</div>
      ) : (
        alerts.map((a, i) => (
          <div key={i} style={{ ...card, borderLeft: `3px solid ${colors[a.type].text}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: colors[a.type].bg, color: colors[a.type].text }}>{a.type}</span>
                <span className="text-sm">{a.msg}</span>
              </div>
              <span className="text-xs" style={{ color: "#64748b" }}>{a.time}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
