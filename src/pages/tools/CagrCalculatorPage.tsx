import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CagrCalculatorPage() {
  const [startValue, setStartValue] = useState("10000");
  const [endValue, setEndValue] = useState("100000");
  const [periods, setPeriods] = useState("10");

  const calc = useMemo(() => {
    const sv = parseFloat(startValue);
    const ev = parseFloat(endValue);
    const p = parseFloat(periods);
    if (!sv || !ev || !p || sv <= 0 || p <= 0) return null;
    const cagr = (Math.pow(ev / sv, 1 / p) - 1) * 100;
    const totalGrowth = ((ev - sv) / sv) * 100;
    const ratio = ev / sv;
    const exponent = 1 / p;
    // Growth path data
    const data = Array.from({ length: Math.floor(p) + 1 }, (_, i) => ({
      year: i,
      value: sv * Math.pow(1 + cagr / 100, i),
    }));
    return { cagr, totalGrowth, ratio, exponent, data, sv, ev, p };
  }, [startValue, endValue, periods]);

  const chartConfig = {
    value: { label: "Value", color: "hsl(var(--primary))" },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Ad slot */}
      <div
        className="ad-slot-leaderboard w-full bg-surface border border-border rounded flex items-center justify-center mb-6"
        style={{ minHeight: "90px" }}
        aria-label="Advertisement"
      >
        <span className="text-xs text-muted-foreground">Advertisement</span>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/tools">Tools</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>CAGR Calculator</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-[1.375rem] font-bold text-foreground mb-1">CAGR Calculator</h1>
      <div className="h-[3px] bg-primary w-full mb-3" />
      <p className="text-sm text-muted-foreground mb-6">
        Calculate the compound annual growth rate from a starting value, an ending value, and the number of periods.
      </p>

      {/* Input card */}
      <Card className="fintech-card mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="sv" className="text-xs font-semibold text-muted-foreground">
                Starting value
              </Label>
              <Input
                id="sv"
                type="number"
                min="0"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev" className="text-xs font-semibold text-muted-foreground">
                Ending value
              </Label>
              <Input
                id="ev"
                type="number"
                min="0"
                value={endValue}
                onChange={(e) => setEndValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="per" className="text-xs font-semibold text-muted-foreground">
                Number of periods
              </Label>
              <Input
                id="per"
                type="number"
                min="0"
                step="1"
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              /* reactive, but button gives UX feedback */
            }}
          >
            Calculate
          </Button>
        </CardContent>
      </Card>

      {calc && (
        <>
          {/* Result cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="fintech-card">
              <CardContent className="py-5 px-5">
                <p className="text-sm font-semibold text-foreground mb-1">Compound annual growth rate</p>
                <p className="text-2xl font-bold text-green-600 mb-2">{calc.cagr.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground">
                  From {fmt(calc.sv)} to {fmt(calc.ev)} over {calc.p} periods.
                </p>
              </CardContent>
            </Card>
            <Card className="fintech-card">
              <CardContent className="py-5 px-5">
                <p className="text-sm font-semibold text-foreground mb-1">Total growth</p>
                <p className="text-2xl font-bold text-foreground mb-2">{calc.totalGrowth.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground">
                  Overall increase from the starting value to the ending value.
                </p>
              </CardContent>
            </Card>
            <Card className="fintech-card">
              <CardContent className="py-5 px-5">
                <p className="text-sm font-semibold text-foreground mb-1">Ending value</p>
                <p className="text-2xl font-bold text-foreground mb-2">{fmt(calc.ev)}</p>
                <p className="text-xs text-muted-foreground">
                  Calculated using a constant compounded growth rate each period.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Formula card */}
          <Card className="fintech-card mb-6">
            <CardContent className="py-5 px-5">
              <p className="text-sm font-semibold text-foreground mb-3">Formula</p>
              <div className="font-mono text-sm text-foreground space-y-1">
                <p>
                  CAGR = ((Ending Value / Starting Value)<sup>1 / Periods</sup> - 1) × 100
                </p>
                <p>
                  CAGR = (({fmt(calc.ev)} / {fmt(calc.sv)})<sup>1 / {calc.p}</sup> - 1) × 100
                </p>
                <p>
                  CAGR = ({calc.ratio.toFixed(1)}<sup>{calc.exponent.toFixed(1)}</sup> - 1) × 100
                </p>
                <p className="font-bold">CAGR = {calc.cagr.toFixed(2)}%</p>
              </div>
            </CardContent>
          </Card>

          {/* Growth Path chart */}
          <Card className="fintech-card mb-6">
            <CardContent className="py-5 px-5">
              <p className="text-lg font-bold text-foreground mb-1">Growth Path</p>
              <p className="text-sm text-muted-foreground mb-4">
                This chart shows the steady compounded transition from the starting value to the ending value.
              </p>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <AreaChart data={calc.data}>
                  <defs>
                    <linearGradient id="cagrFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v: number) => {
                    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                    return `$${v}`;
                  }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="value"
                    stroke="var(--color-value)"
                    fill="url(#cagrFill)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "var(--color-value)" }}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
