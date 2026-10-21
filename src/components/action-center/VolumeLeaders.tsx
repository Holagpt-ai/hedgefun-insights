import { Link } from "react-router-dom";
import { ArrowRight, Calendar } from "lucide-react";
import type { ScreenerLeader } from "@/types/action-center";
import type { CatalystEnrichmentEntry } from "@/hooks/useCatalystEnrichmentForSymbols";
import type { SymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import { resolveVolumeLeaderCatalystIntel } from "@/lib/action-center/action-center-catalyst-intelligence";
import {
  resolveVolumeLeaderListSnapshotMeta,
  resolveVolumeLeaderRowSnapshot,
} from "@/lib/action-center/feed-evidence";
import { SymbolActions } from "./SymbolActions";

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function VolumeLeaders({
  rows,
  loading = false,
  enrichment,
  platformBySymbol,
  catalystPending = false,
  catalystError = false,
  nowMs = Date.now(),
}: {
  rows: ScreenerLeader[];
  loading?: boolean;
  enrichment?: Map<string, CatalystEnrichmentEntry>;
  platformBySymbol?: Map<string, SymbolCatalystPlatformContext>;
  catalystPending?: boolean;
  catalystError?: boolean;
  nowMs?: number;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground animate-pulse">
        Loading volume leaders…
      </div>
    );
  }
  // Preserve the volume-desc order the hook already applied.
  const top = rows.slice(0, 5);
  const snapshotMeta = resolveVolumeLeaderListSnapshotMeta(top, nowMs);
  if (top.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No current Screener results available.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Screener leaders · sorted by volume
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              snapshotMeta.priorSession || snapshotMeta.mixedAge
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground"
            }`}
            data-testid="volume-leaders-list-badge"
            title={snapshotMeta.detailLabel}
          >
            {snapshotMeta.badgeLabel}
          </span>
          <Link to="/dashboard/screeners" className="text-xs font-medium text-accent-blue hover:underline inline-flex items-center gap-1">
            Open Screeners <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <ul className="divide-y">
        {top.map((r) => {
          const sym = r.symbol.toUpperCase();
          const platform = platformBySymbol?.get(sym);
          const cat = enrichment?.get(sym);
          const intel = resolveVolumeLeaderCatalystIntel({
            platform,
            pending: catalystPending && !platform,
            error: catalystError,
          });
          const rowSnap = resolveVolumeLeaderRowSnapshot(r, nowMs);
          return (
            <li key={r.symbol} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="sm:w-40 shrink-0">
                <div className="font-bold text-sm">{r.symbol}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.company_name ?? ""}</div>
                <div
                  className="text-[10px] text-muted-foreground mt-0.5"
                  title={rowSnap.detailLabel}
                  data-testid={`volume-leader-row-snap-${r.symbol}`}
                >
                  {rowSnap.shortLabel}
                </div>
                {intel.availability === "verified" && intel.title && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <Calendar className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[10rem]" title={intel.evidenceLine ?? undefined}>
                      {intel.kind === "upcoming" ? "Upcoming: " : "Verified: "}
                      {intel.title}
                    </span>
                  </div>
                )}
                {intel.availability === "pending" && (
                  <div className="mt-1 text-[10px] text-muted-foreground">Catalyst check pending</div>
                )}
                {intel.availability === "unavailable" && (
                  <div className="mt-1 text-[10px] text-muted-foreground">Catalyst intel unavailable</div>
                )}
                {intel.availability === "none" && cat && (
                  <div className="mt-1 text-[10px] text-muted-foreground">No verified catalyst</div>
                )}
              </div>
              <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">Price</span><br />${fmtNum(r.price)}</div>
                <div><span className="text-muted-foreground">Move</span><br />{r.change_percent === null ? "—" : `${fmtNum(r.change_percent)}%`}</div>
                <div><span className="text-muted-foreground">Volume</span><br />{fmtNum(r.volume, 0)}</div>
                <div><span className="text-muted-foreground">RVOL</span><br />{fmtNum(r.rvol)}</div>
              </div>
              <SymbolActions symbol={r.symbol} showWatchlist showChart />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
