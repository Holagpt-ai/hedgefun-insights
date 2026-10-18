import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { SectorExposureEvidence } from "@/lib/etf/sector-exposure";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 70%, 55%)",
  "hsl(160, 60%, 45%)",
  "hsl(35, 85%, 55%)",
  "hsl(350, 65%, 55%)",
  "hsl(270, 55%, 55%)",
  "hsl(190, 60%, 50%)",
  "hsl(45, 75%, 50%)",
  "hsl(140, 50%, 45%)",
  "hsl(320, 50%, 50%)",
  "hsl(20, 60%, 50%)",
];

interface Props {
  evidence: SectorExposureEvidence;
}

function MetaLine({ evidence }: { evidence: Extract<SectorExposureEvidence, { status: "available" }> }) {
  const coverage = evidence.coverage === "full_portfolio"
    ? "Full portfolio allocation"
    : "Partial sector coverage — not a complete portfolio allocation";
  return (
    <p className="text-xs text-muted-foreground mb-3">
      {coverage}
      {` · Source: ${evidence.source}`}
      {evidence.asOf ? ` · As of ${evidence.asOf}` : ""}
    </p>
  );
}

export function EtfSectorBreakdown({ evidence }: Props) {
  return (
    <div className="mb-6" data-testid="etf-sectors">
      <h2 className="text-[1rem] font-bold text-foreground mb-3">Sector Breakdown</h2>
      {evidence.status !== "available" ? (
        <div className="border border-border rounded-[var(--radius)] p-4 flex flex-col sm:flex-row gap-4 items-center">
          <p className="text-sm text-muted-foreground">Sector exposure unavailable</p>
        </div>
      ) : evidence.coverage === "partial" ? (
        <div className="border border-border rounded-[var(--radius)] p-4">
          <MetaLine evidence={evidence} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {evidence.sectors.map((sector) => (
              <div key={sector.name} className="flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] text-foreground truncate">{sector.name}</span>
                <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
                  {sector.weightPercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-[var(--radius)] p-4">
          <MetaLine evidence={evidence} />
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-[200px] h-[200px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={evidence.sectors}
                    dataKey="weightPercent"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    strokeWidth={1}
                    stroke="hsl(var(--background))"
                  >
                    {evidence.sectors.map((sector, index) => (
                      <Cell key={sector.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, "Weight"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 min-w-0">
              {evidence.sectors.map((sector, index) => (
                <div key={sector.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-[0.8125rem] text-foreground truncate">{sector.name}</span>
                  </div>
                  <span className="text-[0.8125rem] text-muted-foreground tabular-nums flex-shrink-0">
                    {sector.weightPercent.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
