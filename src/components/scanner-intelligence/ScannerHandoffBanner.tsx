import { useSearchParams } from "react-router-dom";
import { canonicalIntelligenceEventType, intelligenceEventLabel } from "@/lib/scanner-intelligence/event-model";
import { normalizeSymbol } from "@/lib/pre-market/builders";

export function readScannerHandoffQuery(params: URLSearchParams): {
  symbol: string;
  eventLabel: string | null;
} | null {
  const symbol = normalizeSymbol(params.get("symbol"));
  if (!symbol) return null;
  const event = canonicalIntelligenceEventType(params.get("event"));
  return { symbol, eventLabel: intelligenceEventLabel(event) };
}

export function ScannerHandoffBanner({
  matched,
}: {
  /** Null while the destination is still loading. */
  matched: boolean | null;
}) {
  const [params] = useSearchParams();
  const handoff = readScannerHandoffQuery(params);
  if (!handoff) return null;

  let detail = "Opened from the scanner handoff. This page does not invent a row.";
  if (matched === true) detail = "This symbol is in the current data on this page.";
  if (matched === false) detail = `No current row for ${handoff.symbol}.`;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground" data-testid="scanner-handoff-banner">
      <span className="font-medium text-foreground">{handoff.symbol}</span>
      {handoff.eventLabel ? ` · ${handoff.eventLabel}` : ""}
      {" · "}
      {detail}
    </div>
  );
}
