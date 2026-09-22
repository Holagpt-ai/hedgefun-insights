import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import { PreMarketSymbolActions } from "./PreMarketSymbolActions";

const CATEGORY_LABEL: Record<string, string> = {
  POWER_HOUR_MOMENTUM: "Power-Hour Momentum",
  AFTER_HOURS_CONTINUATION: "After-Hours Continuation",
  STRONG_CLOSE_NEAR_HOD: "Strong Close Near HOD",
  DAY_TWO_WATCH: "Day-Two Watch",
};

export function LateSessionHandoffsList({
  candidates,
}: {
  candidates: readonly AmInboxLateSessionCandidate[];
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="am-inbox-late-session-handoffs">
      {candidates.map((entry) => {
        const { context } = entry;
        const label = CATEGORY_LABEL[context.sourceCategory] ?? context.sourceCategory;
        return (
          <div key={`${context.symbol}-${context.sourceSessionDate}-${context.sourceCategory}`} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{context.symbol}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                From {context.sourceSessionDate}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {context.historicalContextAvailable
                ? `Historical memory available · ${context.comparableEpisodeCount} comparable episodes`
                : "Historical memory unavailable"}
            </div>
            <PreMarketSymbolActions
              symbol={context.symbol}
              securityId={context.securityId}
            />
          </div>
        );
      })}
    </div>
  );
}
