import { ExternalLink } from "lucide-react";
import { etTimestampLabel, relativeAge } from "@/lib/pre-market/builders";
import type { PreMarketHeadline } from "@/types/pre-market";

export function HeadlinesList({ rows }: { rows: PreMarketHeadline[] }) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border bg-card">
      {rows.map((h) => (
        <div key={h.id} className="flex flex-col gap-1 p-3">
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
  );
}
