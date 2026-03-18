import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, createColumnHelper, type SortingState,
} from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Trade, TradeTag } from "@/hooks/useJournalTrades";

const col = createColumnHelper<Trade & { tagNames: string[] }>();

const fmtCurrency = (v: number | null) => v == null ? "—" : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  trades: Trade[];
  tags: TradeTag[];
  tagAssignments: { trade_id: string; tag_id: string }[];
  onDelete: (id: string) => void;
}

export function TradeLogTable({ trades, tags, tagAssignments, onDelete }: Props) {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "entry_date", desc: true }]);

  const tagMap = useMemo(() => {
    const m = new Map<string, string>();
    tags.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [tags]);

  const data = useMemo(() =>
    trades.map((t) => ({
      ...t,
      tagNames: tagAssignments
        .filter((a) => a.trade_id === t.id)
        .map((a) => tagMap.get(a.tag_id) ?? "")
        .filter(Boolean),
    })),
    [trades, tagAssignments, tagMap]
  );

  const columns = useMemo(() => [
    col.accessor("entry_date", {
      header: "Date",
      cell: (info) => <span className="text-foreground text-sm tabular-nums">{info.getValue()}</span>,
    }),
    col.accessor("symbol", {
      header: "Symbol",
      cell: (info) => (
        <button onClick={() => navigate(`/stocks/${info.getValue().toLowerCase()}`)} className="font-semibold text-accent-blue hover:underline text-sm">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("side", {
      header: "Side",
      cell: (info) => (
        <span className={cn("text-xs font-bold uppercase px-2 py-0.5 rounded", info.getValue() === "buy" ? "bg-[hsl(var(--green-bg))] text-[hsl(var(--green))]" : "bg-[hsl(var(--red-bg))] text-[hsl(var(--red))]")}>
          {info.getValue()}
        </span>
      ),
    }),
    col.accessor("entry_price", {
      header: () => <span className="text-right block">Entry</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{fmtCurrency(info.getValue())}</span>,
    }),
    col.accessor("exit_price", {
      header: () => <span className="text-right block">Exit</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{fmtCurrency(info.getValue())}</span>,
    }),
    col.accessor("quantity", {
      header: () => <span className="text-right block">Qty</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
    col.accessor("pnl", {
      header: () => <span className="text-right block">P&L</span>,
      cell: (info) => {
        const v = info.getValue();
        if (v == null) return <span className="text-muted-foreground text-sm text-right block">—</span>;
        return (
          <span className={cn("text-sm font-semibold tabular-nums text-right block", v >= 0 ? "text-[hsl(var(--green))]" : "text-[hsl(var(--red))]")}>
            {v >= 0 ? "+" : ""}{fmtCurrency(v)}
          </span>
        );
      },
    }),
    col.accessor("setup_type", {
      header: "Setup",
      cell: (info) => <span className="text-muted-foreground text-sm">{info.getValue() ?? "—"}</span>,
    }),
    col.accessor("tagNames", {
      header: "Tags",
      enableSorting: false,
      cell: (info) => (
        <div className="flex gap-1 flex-wrap">
          {info.getValue().map((t) => (
            <span key={t} className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">{t}</span>
          ))}
        </div>
      ),
    }),
    col.display({
      id: "actions",
      cell: (info) => (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-[hsl(var(--red))]"
          onClick={() => onDelete(info.row.original.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    }),
  ], [navigate, onDelete]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  if (trades.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-semibold mb-1">No trades yet</p>
        <p className="text-sm">Click "Log Trade" to record your first entry.</p>
      </div>
    );
  }

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border bg-surface">
                  {hg.headers.map((header) => (
                    <th key={header.id} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer"
                      onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle hover:bg-surface transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} className="text-xs">← Previous</Button>
          <span className="text-sm text-muted-foreground">Page {pageIndex + 1} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} className="text-xs">Next →</Button>
        </div>
      )}
    </>
  );
}
