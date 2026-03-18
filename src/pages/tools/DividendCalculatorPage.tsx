import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Search, TrendingUp, DollarSign, Percent, Calendar } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

type PayoutFreq = "annually" | "semi-annually" | "quarterly" | "monthly";
const FREQ_MAP: Record<PayoutFreq, number> = { annually: 1, "semi-annually": 2, quarterly: 4, monthly: 12 };

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return n.toFixed(2) + "%";
}

interface YearRow {
  year: number;
  portfolioValue: number;
  sharesOwned: number;
  annualDPS: number;
  annualDividend: number;
  yieldOnCost: number;
  afterTaxDividend: number;
  annualInvestment: number;
  stockPrice: number;
  totalProfit: number;
}

function computeProjections(
  initialInvestment: number,
  stockPrice: number,
  dividendYield: number,
  dividendGrowth: number,
  priceGrowth: number,
  years: number,
  annualContribution: number,
  taxRate: number,
  freq: PayoutFreq,
  reinvest: boolean
): YearRow[] {
  const rows: YearRow[] = [];
  let shares = initialInvestment / stockPrice;
  let price = stockPrice;
  let dps = (dividendYield / 100) * stockPrice;
  let totalCostBasis = initialInvestment;
  const periodsPerYear = FREQ_MAP[freq];

  for (let y = 0; y <= years; y++) {
    const portfolioValue = shares * price;
    const annualDiv = dps * shares;
    const afterTax = annualDiv * (1 - taxRate / 100);
    const yoc = totalCostBasis > 0 ? (annualDiv / totalCostBasis) * 100 : 0;
    const totalProfit = portfolioValue - totalCostBasis;

    rows.push({
      year: y,
      portfolioValue,
      sharesOwned: shares,
      annualDPS: dps,
      annualDividend: annualDiv,
      yieldOnCost: yoc,
      afterTaxDividend: afterTax,
      annualInvestment: y === 0 ? 0 : annualContribution,
      stockPrice: price,
      totalProfit,
    });

    if (y < years) {
      // Reinvest dividends throughout the year
      if (reinvest) {
        const divPerPeriod = (dps * shares * (1 - taxRate / 100)) / periodsPerYear;
        for (let p = 0; p < periodsPerYear; p++) {
          shares += divPerPeriod / price;
        }
      }

      // Grow price and DPS for next year
      price *= 1 + priceGrowth / 100;
      dps *= 1 + dividendGrowth / 100;

      // Annual contribution
      if (annualContribution > 0) {
        shares += annualContribution / price;
        totalCostBasis += annualContribution;
      }
    }
  }
  return rows;
}

function NumField({ label, value, onChange, prefix, suffix, id }: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; id: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export default function DividendCalculatorPage() {
  const [initialInvestment, setInitialInvestment] = useState("10000");
  const [stockPrice, setStockPrice] = useState("100");
  const [numShares, setNumShares] = useState("100");
  const [dividendYield, setDividendYield] = useState("2.5");
  const [dividendGrowth, setDividendGrowth] = useState("5");
  const [priceGrowth, setPriceGrowth] = useState("5");
  const [years, setYears] = useState("10");
  const [annualContribution, setAnnualContribution] = useState("0");
  const [taxRate, setTaxRate] = useState("15");
  const [frequency, setFrequency] = useState<PayoutFreq>("quarterly");
  const [reinvest, setReinvest] = useState(true);
  const [sharesManual, setSharesManual] = useState(false);

  // Sync shares ↔ investment
  const handleInvestmentChange = (v: string) => {
    setInitialInvestment(v);
    if (!sharesManual) {
      const sp = parseFloat(stockPrice);
      if (sp > 0) setNumShares((parseFloat(v) / sp).toFixed(2));
    }
  };
  const handlePriceChange = (v: string) => {
    setStockPrice(v);
    if (!sharesManual) {
      const sp = parseFloat(v);
      if (sp > 0) setNumShares((parseFloat(initialInvestment) / sp).toFixed(2));
    }
  };
  const handleSharesChange = (v: string) => {
    setSharesManual(true);
    setNumShares(v);
    const sp = parseFloat(stockPrice);
    if (sp > 0) setInitialInvestment((parseFloat(v) * sp).toFixed(2));
  };

  const rows = useMemo(() => {
    const inv = parseFloat(initialInvestment) || 0;
    const sp = parseFloat(stockPrice) || 1;
    const dy = parseFloat(dividendYield) || 0;
    const dg = parseFloat(dividendGrowth) || 0;
    const pg = parseFloat(priceGrowth) || 0;
    const yr = parseInt(years) || 1;
    const ac = parseFloat(annualContribution) || 0;
    const tr = parseFloat(taxRate) || 0;
    return computeProjections(inv, sp, dy, dg, pg, yr, ac, tr, frequency, reinvest);
  }, [initialInvestment, stockPrice, dividendYield, dividendGrowth, priceGrowth, years, annualContribution, taxRate, frequency, reinvest]);

  const lastRow = rows[rows.length - 1];
  const firstRow = rows[0];
  const inv = parseFloat(initialInvestment) || 0;
  const totalContributions = inv + rows.reduce((s, r) => s + r.annualInvestment, 0);
  const totalDividends = rows.reduce((s, r) => s + r.afterTaxDividend, 0);
  const priceGrowthAmount = lastRow.portfolioValue - totalContributions - (reinvest ? totalDividends : 0);
  const portfolioGainPct = inv > 0 ? ((lastRow.portfolioValue - inv) / inv) * 100 : 0;
  const divIncomeGainPct = firstRow.annualDividend > 0 ? ((lastRow.annualDividend - firstRow.annualDividend) / firstRow.annualDividend) * 100 : 0;

  const chartConfig = {
    value: { label: "Value", color: "hsl(var(--primary))" },
    income: { label: "Income", color: "hsl(var(--primary))" },
    yoc: { label: "Yield on Cost", color: "hsl(var(--primary))" },
  };

  const yr = parseInt(years) || 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Ad slot */}
      <div className="w-full bg-surface border border-border rounded flex items-center justify-center mb-6" style={{ minHeight: "90px" }} aria-label="Advertisement">
        <span className="text-xs text-muted-foreground">Advertisement</span>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/tools">Tools</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Dividend Calculator</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-[1.375rem] font-bold text-foreground mb-2">Dividend Calculator</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A free dividend calculator to see how much income and investment growth you can expect over time, with or without dividend reinvestment (DRIP).
      </p>

      {/* Stock search stub */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search for a stock to auto-fill data (optional)" className="pl-9" readOnly />
      </div>

      {/* Input grid */}
      <Card className="fintech-card mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <NumField id="inv" label="Initial Investment" prefix="$" value={initialInvestment} onChange={handleInvestmentChange} />
            <NumField id="sp" label="Stock Price" prefix="$" value={stockPrice} onChange={handlePriceChange} />
            <NumField id="shares" label="Number of Shares" value={numShares} onChange={handleSharesChange} />
            <NumField id="dy" label="Initial Dividend Yield" suffix="%" value={dividendYield} onChange={setDividendYield} />
            <NumField id="dg" label="Dividend Growth" suffix="%" value={dividendGrowth} onChange={setDividendGrowth} />
            <NumField id="pg" label="Stock Price Growth" suffix="%" value={priceGrowth} onChange={setPriceGrowth} />
            <NumField id="yrs" label="Years to Invest" value={years} onChange={setYears} />
            <NumField id="ac" label="Annual Investment" prefix="$" value={annualContribution} onChange={setAnnualContribution} />
            <NumField id="tr" label="Dividend Tax Rate" suffix="%" value={taxRate} onChange={setTaxRate} />
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Payout Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as PayoutFreq)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="semi-annually">Semi-Annually</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground">Results After {yr} Years</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="reinvest-toggle" className="text-sm text-muted-foreground">Reinvest Dividends</Label>
          <Switch id="reinvest-toggle" checked={reinvest} onCheckedChange={setReinvest} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-xs text-muted-foreground mb-1">Total Portfolio Value</p>
            <p className="text-xl font-bold text-foreground">${fmt(lastRow.portfolioValue)}</p>
            <span className="text-xs font-semibold text-green-600">↑ {fmtPct(portfolioGainPct)}</span>
          </CardContent>
        </Card>
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-xs text-muted-foreground mb-1">Annual Dividend Income</p>
            <p className="text-xl font-bold text-foreground">${fmt(lastRow.annualDividend)}</p>
            <span className="text-xs font-semibold text-green-600">↑ {fmtPct(divIncomeGainPct)}</span>
          </CardContent>
        </Card>
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-xs text-muted-foreground mb-1">Monthly Dividend Income</p>
            <p className="text-xl font-bold text-foreground">${fmt(lastRow.annualDividend / 12)}</p>
            <span className="text-xs font-semibold text-green-600">↑ {fmtPct(divIncomeGainPct)}</span>
          </CardContent>
        </Card>
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-xs text-muted-foreground mb-1">Yield on Cost</p>
            <p className="text-xl font-bold text-foreground">{fmtPct(lastRow.yieldOnCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Total Return Breakdown */}
      <h2 className="text-lg font-bold text-foreground mb-3">Total Return Breakdown</h2>
      <Card className="fintech-card mb-6">
        <CardContent className="py-5 px-5">
          <p className="text-center text-2xl font-bold text-foreground mb-1">
            ${fmt(lastRow.portfolioValue)} <span className="text-sm font-semibold text-green-600">(+{fmtPct(portfolioGainPct)})</span>
          </p>
          {/* Stacked bar */}
          <div className="flex h-6 rounded overflow-hidden mt-3 mb-3">
            {[
              { value: inv, color: "bg-primary", label: "Initial Investment" },
              { value: totalContributions - inv, color: "bg-orange-500", label: "Additional Investments" },
              { value: totalDividends > 0 ? totalDividends : 0, color: "bg-green-500", label: "Dividends" },
              { value: priceGrowthAmount > 0 ? priceGrowthAmount : 0, color: "bg-blue-800", label: "Stock Price Growth" },
            ].map((seg, i) => {
              const total = lastRow.portfolioValue;
              const pct = total > 0 ? (seg.value / total) * 100 : 0;
              return pct > 0 ? <div key={i} className={`${seg.color}`} style={{ width: `${pct}%` }} title={seg.label} /> : null;
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Initial Investment", value: inv, color: "bg-primary" },
              { label: "Additional Investments", value: totalContributions - inv, color: "bg-orange-500" },
              { label: "Dividends", value: totalDividends, color: "bg-green-500" },
              { label: "Stock Price Growth", value: priceGrowthAmount > 0 ? priceGrowthAmount : 0, color: "bg-blue-800" },
            ].map((seg, i) => {
              const pct = lastRow.portfolioValue > 0 ? (seg.value / lastRow.portfolioValue) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-sm ${seg.color}`} />
                  <div>
                    <span className="text-primary font-medium">{seg.label}</span>
                    <p className="text-muted-foreground">${fmt(seg.value)}</p>
                    <p className="text-muted-foreground">{fmtPct(pct)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Growth Projections */}
      <h2 className="text-lg font-bold text-foreground mb-3">Growth Projections</h2>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Portfolio Value line */}
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-sm font-semibold text-center text-foreground mb-2">Total Portfolio Value ($)</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" label={{ value: "Year", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="portfolioValue" name="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Annual Income bar */}
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-sm font-semibold text-center text-foreground mb-2">Annual Dividend Income ($)</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={rows.filter((r) => r.year > 0)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" label={{ value: "Year", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="annualDividend" name="income" fill="var(--color-income)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly Income bar */}
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-sm font-semibold text-center text-foreground mb-2">Monthly Dividend Income ($)</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={rows.filter((r) => r.year > 0).map((r) => ({ ...r, monthlyDiv: r.annualDividend / 12 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" label={{ value: "Year", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="monthlyDiv" name="income" fill="var(--color-income)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Yield on Cost line */}
        <Card className="fintech-card">
          <CardContent className="py-4 px-4">
            <p className="text-sm font-semibold text-center text-foreground mb-2">Yield on Cost (%)</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" label={{ value: "Year", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="yieldOnCost" name="yoc" stroke="var(--color-yoc)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Projections Table */}
      <h2 className="text-lg font-bold text-foreground mb-3">Detailed Projections</h2>
      <Card className="fintech-card mb-6 overflow-x-auto">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Year", "Portfolio Value", "Shares Owned", "Annual DPS", "Annual Dividend", "Yield on Cost", "After-Tax Dividend", "Annual Investment", "Stock Price", "Total Profit"].map((h) => (
                  <th key={h} className="table-header px-3 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="table-cell px-3 py-2">{r.year}</td>
                  <td className="table-cell px-3 py-2">${fmt(r.portfolioValue)}</td>
                  <td className="table-cell px-3 py-2">{r.sharesOwned.toFixed(2)}</td>
                  <td className="table-cell px-3 py-2">${r.annualDPS.toFixed(2)}</td>
                  <td className="table-cell px-3 py-2">${fmt(r.annualDividend)}</td>
                  <td className="table-cell px-3 py-2">{fmtPct(r.yieldOnCost)}</td>
                  <td className="table-cell px-3 py-2">${fmt(r.afterTaxDividend)}</td>
                  <td className="table-cell px-3 py-2">${fmt(r.annualInvestment)}</td>
                  <td className="table-cell px-3 py-2">${fmt(r.stockPrice)}</td>
                  <td className="table-cell px-3 py-2 font-semibold text-green-600">${fmt(r.totalProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Bottom ad slot */}
      <div className="w-full bg-surface border border-border rounded flex items-center justify-center" style={{ minHeight: "250px", maxWidth: "300px", margin: "0 auto" }} aria-label="Advertisement">
        <span className="text-xs text-muted-foreground">Advertisement</span>
      </div>
    </div>
  );
}
