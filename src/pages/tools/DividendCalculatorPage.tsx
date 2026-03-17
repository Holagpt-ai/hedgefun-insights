import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function DividendCalculatorPage() {
  const [stockPrice, setStockPrice] = useState("");
  const [annualDividend, setAnnualDividend] = useState("");
  const [shares, setShares] = useState("");
  const [result, setResult] = useState<{ yield: number; income: number } | null>(null);

  const calculate = () => {
    const price = parseFloat(stockPrice);
    const dividend = parseFloat(annualDividend);
    const numShares = parseFloat(shares) || 0;
    if (!price || !dividend || price <= 0) return;
    const yieldPct = (dividend / price) * 100;
    const income = dividend * numShares;
    setResult({ yield: yieldPct, income });
  };

  const clear = () => {
    setStockPrice("");
    setAnnualDividend("");
    setShares("");
    setResult(null);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-[1.375rem] font-bold text-foreground mb-6">Dividend Calculator</h1>
      <Card className="fintech-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Calculate Dividend Yield & Income</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="price">Stock Price ($)</Label>
            <Input id="price" type="number" min="0" step="0.01" placeholder="e.g. 150.00" value={stockPrice} onChange={(e) => setStockPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dividend">Annual Dividend Per Share ($)</Label>
            <Input id="dividend" type="number" min="0" step="0.01" placeholder="e.g. 3.28" value={annualDividend} onChange={(e) => setAnnualDividend(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shares">Number of Shares (optional)</Label>
            <Input id="shares" type="number" min="0" placeholder="e.g. 100" value={shares} onChange={(e) => setShares(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={calculate} className="flex-1">Calculate</Button>
            <Button variant="outline" onClick={clear}>Clear</Button>
          </div>

          {result !== null && (
            <div className="space-y-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Dividend Yield</p>
                  <p className="text-3xl font-bold text-primary">{result.yield.toFixed(2)}%</p>
                </CardContent>
              </Card>
              {parseFloat(shares) > 0 && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Annual Dividend Income</p>
                    <p className="text-3xl font-bold text-primary">${result.income.toFixed(2)}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
