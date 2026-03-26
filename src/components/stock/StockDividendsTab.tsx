import { DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

interface Dividend {
  cash_amount: number;
  ex_dividend_date: string;
  declaration_date?: string | null;
  pay_date?: string | null;
  frequency?: number;
}

interface Props {
  dividends: Dividend[] | undefined;
  loading: boolean;
  ticker: string;
  currentPrice: number | null;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function detectFrequency(divs: Dividend[]): string {
  if (divs.length < 2) return "—";
  const dates = divs.slice(0, 5).map(d => new Date(d.ex_dividend_date + "T00:00:00").getTime());
  const gaps: number[] = [];
  for (let i = 0; i < dates.length - 1; i++) {
    gaps.push(Math.abs(dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avg < 50) return "Monthly";
  if (avg < 120) return "Quarterly";
  if (avg < 270) return "Semi-Annual";
  if (avg < 450) return "Annual";
  return "Irregular";
}

function freqLabel(freq: number | undefined): string {
  switch (freq) {
    case 1: return "Annual";
    case 2: return "Semi-Annual";
    case 4: return "Quarterly";
    case 12: return "Monthly";
    default: return "—";
  }
}

export default function StockDividendsTab({ dividends, loading, ticker, currentPrice }: Props) {
  if (loading) {
    return (
      <div className="space-y-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
    );
  }

  if (!dividends || dividends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <DollarSign className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-[1rem] font-semibold text-foreground mb-1">No Dividends</p>
        <p className="text-[0.875rem] text-muted-foreground">{ticker} has not paid any dividends.</p>
      </div>
    );
  }

  const ttm = dividends.slice(0, 4).reduce((s, d) => s + d.cash_amount, 0);
  const yieldPct = currentPrice && currentPrice > 0 ? ((ttm / currentPrice) * 100).toFixed(2) : "—";
  const exDate = fmtDate(dividends[0]?.ex_dividend_date);
  const frequency = detectFrequency(dividends);

  const stats = [
    { label: "Dividend (TTM)", value: `$${ttm.toFixed(2)}` },
    { label: "Dividend Yield", value: yieldPct === "—" ? "—" : `${yieldPct}%` },
    { label: "Ex-Dividend Date", value: exDate },
    { label: "Payout Frequency", value: frequency },
  ];

  return (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-[1rem] font-bold text-foreground mb-3">Dividend History</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ex-Dividend Date</TableHead>
              <TableHead>Cash Amount</TableHead>
              <TableHead className="hidden sm:table-cell">Declaration Date</TableHead>
              <TableHead className="hidden sm:table-cell">Pay Date</TableHead>
              <TableHead className="hidden sm:table-cell">Frequency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dividends.map((d, i) => (
              <TableRow key={i}>
                <TableCell>{fmtDate(d.ex_dividend_date)}</TableCell>
                <TableCell>${d.cash_amount.toFixed(5)}</TableCell>
                <TableCell className="hidden sm:table-cell">{fmtDate(d.declaration_date)}</TableCell>
                <TableCell className="hidden sm:table-cell">{fmtDate(d.pay_date)}</TableCell>
                <TableCell className="hidden sm:table-cell">{freqLabel(d.frequency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-3">Data provided by Massive · Updated daily</p>
      </div>
    </div>
  );
}
