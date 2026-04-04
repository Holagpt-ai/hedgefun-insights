import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const card: React.CSSProperties = { background: "#334155", border: "1px solid #334155", borderRadius: 8 };
const inputStyle: React.CSSProperties = { background: "#334155", borderColor: "#334155", color: "#e2e8f0" };

export default function AdminNewsPage() {
  const [news, setNews] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ headline: "", source: "", url: "", category: "general" });

  const load = async () => {
    const { data } = await supabase.from("market_news").select("*").order("published_at", { ascending: false }).limit(50);
    setNews(data || []);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    await supabase.from("market_news").insert([form] as any);
    setForm({ headline: "", source: "", url: "", category: "general" });
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("market_news").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">News Feed</h1>
        <Button size="sm" style={{ background: "#2563eb" }} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add News Item"}
        </Button>
      </div>

      {showForm && (
        <div style={{ ...card, padding: 16 }} className="space-y-3">
          <Input placeholder="Headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} style={inputStyle} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={inputStyle} />
            <Input placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={inputStyle} />
          </div>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md px-3 py-2 text-sm" style={inputStyle as any}>
            {["general", "markets", "stocks", "ipo", "etf"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button size="sm" style={{ background: "#2563eb" }} onClick={handleAdd}>Save</Button>
        </div>
      )}

      <div style={card} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["Headline", "Source", "Category", "Published", "Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: "#94a3b8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {news.map((n) => (
              <tr key={n.id} style={{ borderBottom: "1px solid #334155" }}>
                <td className="px-4 py-3 max-w-xs truncate">{n.headline}</td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{n.source}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.15)", color: "#60a5fa" }}>{n.category}</span>
                </td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{n.published_at ? new Date(n.published_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <button className="text-xs mr-2" style={{ color: "#60a5fa" }}>Edit</button>
                  <button className="text-xs" style={{ color: "#f87171" }} onClick={() => handleDelete(n.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
