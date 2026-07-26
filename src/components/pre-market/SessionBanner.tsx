import { Clock } from "lucide-react";
import { etTimestampLabel, marketContextLabel } from "@/lib/pre-market/builders";
import type { MarketContext } from "@/types/pre-market";

const DOT: Record<string, string> = {
  premarket: "bg-amber-500",
  regular: "bg-emerald-500",
  afterhours: "bg-amber-500",
  closed: "bg-muted-foreground",
  non_trading_day: "bg-muted-foreground",
  unavailable: "bg-destructive",
};

export function SessionBanner({ context, loading }: { context: MarketContext | null; loading: boolean }) {
  if (loading) {
    return <div className="h-16 animate-pulse rounded-xl border bg-card" aria-busy="true" />;
  }
  if (!context) {
    return (
      <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        Market session unavailable — no session claim is being made.
      </div>
    );
  }

  const next = etTimestampLabel(context.next_known_session_at);
  const open = etTimestampLabel(context.official_open_at);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${DOT[context.status] ?? DOT.unavailable}`} />
        <span className="text-sm font-semibold">{marketContextLabel(context.status)}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {context.et_date} · {context.et_time} ET
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {context.source === "polygon_marketstatus"
          ? "Session state confirmed against the provider market calendar."
          : "Provider market calendar unavailable — session state is not asserted."}
        {open ? ` · Official open ${open}` : ""}
        {!open && next ? ` · Next known session ${next}` : ""}
      </p>
    </div>
  );
}
