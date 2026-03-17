import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function CagrCalculatorPage() {
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [years, setYears] = useState("");
  const [result, setResult] = useState<number | null>(null);

  const calculate = () => {
    const sv = parseFloat(startValue);
    const ev = parseFloat(endValue);
    const y = parseFloat(years);
    if (!sv || !ev || !y || sv <= 0 || y <= 0) return;
    const cagr = (Math.pow(ev / sv, 1 / y) - 1) * 100;
    setResult(cagr);
  };

  const clear = () => {
    setStartValue("");
    setEndValue("");
    setYears("");
    setResult(null);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-[1.375rem] font-bold text-foreground mb-6">CAGR Calculator</h1>
      <Card className="fintech-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Calculate Compound Annual Growth Rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="start">Starting Value ($)</Label>
            <Input id="start" type="number" min="0" placeholder="e.g. 10000" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end">Ending Value ($)</Label>
            <Input id="end" type="number" min="0" placeholder="e.g. 25000" value={endValue} onChange={(e) => setEndValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="years">Number of Years</Label>
            <Input id="years" type="number" min="0" step="0.1" placeholder="e.g. 5" value={years} onChange={(e) => setYears(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={calculate} className="flex-1">Calculate</Button>
            <Button variant="outline" onClick={clear}>Clear</Button>
          </div>

          {result !== null && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">CAGR Result</p>
                <p className="text-3xl font-bold text-primary">{result.toFixed(2)}%</p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
