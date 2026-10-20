import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import { buildHistoricalMarketIntelligence } from "@/lib/historical-intelligence/historical-market-intelligence";
import { tickerToSlug } from "@/lib/ticker-utils";
import { Link } from "react-router-dom";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatVolume(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function HistoricalIntelligenceSection({
  context,
  matchSummary,
  symbol,
}: {
  context: RepeatMoverContext | null | undefined;
  matchSummary?: HistoricalMatchSummary | null;
  symbol: string;
}) {
  const model = buildHistoricalMarketIntelligence({ context, matchSummary, symbol });
  const slug = tickerToSlug(symbol);

  return (
    <section className="space-y-2 rounded-md border border-border/70 bg-muted/10 p-3" data-testid="historical-intelligence">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Historical Activity
        </h3>
        <Link
          to={`/stocks/${slug}`}
          className="text-[11px] font-medium text-accent-blue hover:underline"
        >
          Stock detail
        </Link>
      </div>
      <p className="text-[10px] text-muted-foreground">{model.limitationLine}</p>

      {model.status === "unavailable" ? (
        <p className="text-[12px] text-muted-foreground">Historical intelligence unavailable for this symbol.</p>
      ) : (
        <ul className="space-y-1 text-[12px] text-foreground">
          <li>
            <span className="text-muted-foreground">Scanner appearances: </span>
            {model.distinctSessionAppearances !== null
              ? `${model.distinctSessionAppearances} distinct sessions (stored episodes)`
              : "—"}
          </li>
          <li>
            <span className="text-muted-foreground">Last appearance: </span>
            {formatDate(model.lastAppearanceDate) ?? "—"}
          </li>
          <li>
            <span className="text-muted-foreground">Previous recorded volume: </span>
            {formatVolume(model.lastRecordedVolume)}
            {model.lastRecordedRvol !== null ? (
              <span className="text-muted-foreground"> · RVOL {model.lastRecordedRvol.toFixed(1)}×</span>
            ) : null}
          </li>
          {model.continuation.summaryLine && (
            <li>
              <span className="text-muted-foreground">Next-session continuation: </span>
              {model.continuation.summaryLine}
            </li>
          )}
        </ul>
      )}

      {model.momentumObservations.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recorded momentum (comparable episodes)
          </div>
          <ul className="space-y-0.5 text-[11px] tabular-nums">
            {model.momentumObservations.slice(0, 4).map((obs) => (
              <li key={obs.sessionDate} className="text-muted-foreground">
                {formatDate(obs.sessionDate) ?? obs.sessionDate} · {formatPct(obs.movePct)} · vol{" "}
                {formatVolume(obs.volume)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.verifiedCatalystEvents.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Verified historical catalysts
          </div>
          <ul className="space-y-1 text-[11px]">
            {model.verifiedCatalystEvents.map((ev) => (
              <li key={`${ev.title}-${ev.publishedAt}`}>
                <span className="font-medium text-foreground">{ev.title}</span>
                <span className="text-muted-foreground">
                  {ev.source ? ` · ${ev.source}` : ""}
                  {ev.publishedAt ? ` · ${ev.publishedAt.slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">Related events only — causation not established.</p>
        </div>
      )}

      <div className="border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground">
        {model.coverageLine && <p>{model.coverageLine}</p>}
        <p>{model.delayDisclosure}</p>
        {model.status === "partial" && (
          <p>Historical profile still building — counts may under-represent stored history.</p>
        )}
      </div>
    </section>
  );
}
