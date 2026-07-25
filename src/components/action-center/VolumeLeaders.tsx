import { Link } from "react-router-dom";
import { ArrowRight, Calendar } from "lucide-react";
import type { ScreenerLeader } from "@/types/action-center";
import type { CatalystEnrichmentEntry } from "@/hooks/useCatalystEnrichmentForSymbols";
import { SymbolActions } from "./SymbolActions";

function ageLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function VolumeLeaders({ rows }: { rows: ScreenerLeader[] }) {
  const top = rows.slice(0, 5);
  if (top.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No current Screener results available.
      </div>
    );
  }
  const newest = top.reduce((max, r) => {
    const t = Date.parse(r.updated_at);
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const stale = newest > 0 && Date.now() - newest > 30 * 60_000;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Day-Trade Radar · sorted by volume
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${stale ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
            {stale ? "Delayed" : "Recent"} · {newest ? ageLabel(new Date(newest).toISOString()) : "—"}
          </span>
          <Link to="/dashboard/screeners" className="text-xs font-medium text-accent-blue hover:underline inline-flex items-center gap-1">
            Open Screeners <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <ul className="divide-y">
        {top.map((r) => (
          <li key={r.symbol} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="sm:w-40 shrink-0">
              <div className="font-bold text-sm">{r.symbol}</div>
              <div className="text-[11px] text-muted-foreground truncate">{r.company_name ?? ""}</div>
            </div>
            <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
              <div><span className="text-muted-foreground">Price</span><br />${fmtNum(r.price)}</div>
              <div><span className="text-muted-foreground">Move</span><br />{r.change_percent === null ? "—" : `${fmtNum(r.change_percent)}%`}</div>
              <div><span className="text-muted-foreground">Volume</span><br />{fmtNum(r.volume, 0)}</div>
              <div><span className="text-muted-foreground">RVOL</span><br />{fmtNum(r.rvol)}</div>
            </div>
            <SymbolActions symbol={r.symbol} showWatchlist showChart />
          </li>
        ))}
      </ul>
    </div>
  );
}
