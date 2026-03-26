import { GitBranch } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

interface Split {
  execution_date: string;
  split_from: number;
  split_to: number;
}

interface Props {
  splits: Split[] | undefined;
  loading: boolean;
  ticker: string;
}

function fmtDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StockSplitsTab({ splits, loading, ticker }: Props) {
  if (loading) {
    return (
      <div className="space-y-3 py-6">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
    );
  }

  if (!splits || splits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <GitBranch className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-[1rem] font-semibold text-foreground mb-1">No Stock Splits</p>
        <p className="text-[0.875rem] text-muted-foreground">{ticker} has no recorded stock splits.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h3 className="text-[1rem] font-bold text-foreground mb-1">Stock Split History</h3>
        <p className="text-[0.875rem] text-muted-foreground mb-4">
          A stock split increases the number of shares while proportionally reducing the price per share.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Execution Date</TableHead>
            <TableHead>Split Ratio</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {splits.map((s, i) => {
            const isForward = s.split_to > s.split_from;
            return (
              <TableRow key={i}>
                <TableCell>{fmtDate(s.execution_date)}</TableCell>
                <TableCell>{s.split_to}-for-{s.split_from}</TableCell>
                <TableCell>
                  {isForward ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Forward Split</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Reverse Split</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground mt-3">Data provided by Massive · Updated daily</p>
    </div>
  );
}
