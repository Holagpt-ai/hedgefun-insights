import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const SECTOR_DATA: Record<string, { name: string; weight: number }[]> = {
  SPY: [
    { name: "Technology", weight: 31.4 },
    { name: "Healthcare", weight: 12.1 },
    { name: "Financials", weight: 13.2 },
    { name: "Consumer Discretionary", weight: 10.5 },
    { name: "Communication Services", weight: 8.9 },
    { name: "Industrials", weight: 8.6 },
    { name: "Consumer Staples", weight: 5.8 },
    { name: "Energy", weight: 3.5 },
    { name: "Utilities", weight: 2.4 },
    { name: "Real Estate", weight: 2.2 },
    { name: "Materials", weight: 1.4 },
  ],
  QQQ: [
    { name: "Technology", weight: 51.2 },
    { name: "Communication Services", weight: 16.1 },
    { name: "Consumer Discretionary", weight: 13.8 },
    { name: "Healthcare", weight: 6.9 },
    { name: "Consumer Staples", weight: 4.8 },
    { name: "Industrials", weight: 4.2 },
    { name: "Utilities", weight: 1.4 },
    { name: "Energy", weight: 0.9 },
    { name: "Financials", weight: 0.5 },
    { name: "Real Estate", weight: 0.2 },
  ],
  DIA: [
    { name: "Financials", weight: 22.4 },
    { name: "Healthcare", weight: 18.6 },
    { name: "Technology", weight: 17.8 },
    { name: "Industrials", weight: 14.2 },
    { name: "Consumer Discretionary", weight: 12.8 },
    { name: "Consumer Staples", weight: 5.6 },
    { name: "Energy", weight: 3.8 },
    { name: "Communication Services", weight: 2.6 },
    { name: "Materials", weight: 1.4 },
    { name: "Utilities", weight: 0.8 },
  ],
  IWM: [
    { name: "Healthcare", weight: 16.8 },
    { name: "Industrials", weight: 16.2 },
    { name: "Financials", weight: 15.8 },
    { name: "Technology", weight: 13.4 },
    { name: "Consumer Discretionary", weight: 11.2 },
    { name: "Energy", weight: 7.6 },
    { name: "Real Estate", weight: 6.4 },
    { name: "Materials", weight: 4.2 },
    { name: "Utilities", weight: 3.8 },
    { name: "Consumer Staples", weight: 2.8 },
    { name: "Communication Services", weight: 1.8 },
  ],
};

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
  symbol: string;
}

export function EtfSectorBreakdown({ symbol }: Props) {
  const sectors = SECTOR_DATA[symbol];
  if (!sectors) return null;

  return (
    <div className="mb-6">
      <h2 className="text-[1rem] font-bold text-foreground mb-3">
        Sector Breakdown
      </h2>
      <div className="border border-border rounded-[var(--radius)] p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          {/* Donut chart */}
          <div className="w-[200px] h-[200px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectors}
                  dataKey="weight"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  strokeWidth={1}
                  stroke="hsl(var(--background))"
                >
                  {sectors.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Weight"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 min-w-0">
            {sectors.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-[0.8125rem] text-foreground truncate">{s.name}</span>
                </div>
                <span className="text-[0.8125rem] text-muted-foreground tabular-nums flex-shrink-0">
                  {s.weight.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
