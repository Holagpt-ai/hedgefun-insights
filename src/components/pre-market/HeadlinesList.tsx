import { ExternalLink } from "lucide-react";
import { etTimestampLabel, relativeAge } from "@/lib/pre-market/builders";
import { FEED_SYNC_UNAVAILABLE } from "@/lib/pre-market/headlines";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";
import type { PreMarketHeadline } from "@/types/pre-market";

export function HeadlinesList({
  rows,
  feedSyncAt = null,
}: {
  rows: PreMarketHeadline[];
  feedSyncAt?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        {feedSyncAt
          ? `Feed synchronized ${etTimestampLabel(feedSyncAt)}`
          : FEED_SYNC_UNAVAILABLE}
      </p>
      <TopNReveal items={rows}>
        {(visible) => (
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border bg-card">
            {visible.map((h) => (
              <div key={h.id} className="flex min-w-0 flex-col gap-1 p-3">
                {h.url ? (
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 break-words text-sm font-medium leading-snug hover:underline"
                  >
                    {h.headline}
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  </a>
                ) : (
                  <span className="break-words text-sm font-medium leading-snug">{h.headline}</span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {h.source ?? "Source unavailable"} · published {etTimestampLabel(h.published_at)}
                  {relativeAge(h.published_at) ? ` · ${relativeAge(h.published_at)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </TopNReveal>
    </div>
  );
}
