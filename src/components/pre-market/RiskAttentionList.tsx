import { Link } from "react-router-dom";
import { attentionDetailLines, groupAttentionBySymbol } from "@/lib/session-intelligence/group-attention";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";
import type { PreMarketAttentionItem } from "@/types/pre-market";

export function RiskAttentionList({ items }: { items: PreMarketAttentionItem[] }) {
  const groups = groupAttentionBySymbol(items);

  return (
    <TopNReveal items={groups}>
      {(visible) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((g) => {
            const lines = attentionDetailLines(g.items);
            const multi = g.items.length > 1;
            const body = (
              <div className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20">
                <div className="text-sm font-medium leading-snug">
                  {g.symbol ? (
                    multi ? (
                      <span className="font-semibold">{g.symbol}</span>
                    ) : (
                      <>
                        <span className="font-semibold">{g.symbol} · </span>
                        {g.items[0].label}
                      </>
                    )
                  ) : (
                    g.items[0].label
                  )}
                </div>
                {multi ? (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {lines.map((line, i) => (
                      <li key={g.items[i]?.id ?? `${g.key}-${i}`} className="break-words">{line}</li>
                    ))}
                  </ul>
                ) : (
                  g.items[0].detail && (
                    <div className="break-words text-xs text-muted-foreground">{g.items[0].detail}</div>
                  )
                )}
              </div>
            );
            return g.route ? (
              <Link key={g.key} to={g.route} className="block h-full">
                {body}
              </Link>
            ) : (
              <div key={g.key}>{body}</div>
            );
          })}
        </div>
      )}
    </TopNReveal>
  );
}
