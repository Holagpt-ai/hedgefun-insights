import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const card: React.CSSProperties = { background: "#334155", border: "1px solid #334155", borderRadius: 8, padding: 20 };
const inputStyle: React.CSSProperties = { background: "#334155", borderColor: "#334155", color: "#e2e8f0" };
const labelStyle: React.CSSProperties = { color: "#94a3b8", fontSize: "0.75rem", marginBottom: 4, display: "block" };

export default function AdminSettingsPage() {
  const [site, setSite] = useState({ name: "HedgeFun", tagline: "Your edge in every market.", email: "info@hedgefun.fun", address: "1631 Del Prado Blvd S. #1124, Cape Coral, FL 33990" });
  const [limits, setLimits] = useState({ freeDaily: 10, anonSession: 3 });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <div style={card} className="space-y-4">
        <p className="text-sm font-semibold">Site Information</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label style={labelStyle}>Site Name</label><Input value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>Tagline</label><Input value={site.tagline} onChange={(e) => setSite({ ...site, tagline: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>Contact Email</label><Input value={site.email} onChange={(e) => setSite({ ...site, email: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>Contact Address</label><Input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} style={inputStyle} /></div>
        </div>
        <Button size="sm" style={{ background: "#2563eb" }}>Save Changes</Button>
      </div>

      <div style={card} className="space-y-4">
        <p className="text-sm font-semibold">Stripe Configuration</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Pro Monthly Price ID</label>
            <Input value="price_xxx_monthly" readOnly style={{ ...inputStyle, opacity: 0.7 }} />
          </div>
          <div>
            <label style={labelStyle}>Pro Annual Price ID</label>
            <Input value="price_xxx_annual" readOnly style={{ ...inputStyle, opacity: 0.7 }} />
          </div>
        </div>
      </div>

      <div style={card} className="space-y-4">
        <p className="text-sm font-semibold">Chatbot Configuration</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Free Daily Limit</label>
            <Input type="number" value={limits.freeDaily} onChange={(e) => setLimits({ ...limits, freeDaily: +e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Anonymous Session Limit</label>
            <Input type="number" value={limits.anonSession} onChange={(e) => setLimits({ ...limits, anonSession: +e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>System Prompt (read-only)</label>
          <Textarea readOnly rows={4} value="You are HedgeFun AI, a financial markets assistant. You help users understand stocks, ETFs, earnings, and market analysis. Always include a disclaimer that you are not a financial advisor." style={{ ...inputStyle, opacity: 0.7 }} />
        </div>
        <Button size="sm" style={{ background: "#2563eb" }}>Save Limits</Button>
      </div>

      <div style={card} className="space-y-4">
        <p className="text-sm font-semibold">Admin Role Management</p>
        <p className="text-xs" style={{ color: "#94a3b8" }}>Users with admin plan can access this console.</p>
        <div className="flex gap-2">
          <Input placeholder="Enter email to grant admin access" style={inputStyle} className="max-w-sm" />
          <Button size="sm" style={{ background: "#2563eb" }}>Add Admin</Button>
        </div>
      </div>
    </div>
  );
}
