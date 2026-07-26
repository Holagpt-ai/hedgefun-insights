import { Link } from "react-router-dom";
import type { PreMarketAttentionItem } from "@/types/pre-market";

export function RiskAttentionList({ items }: { items: PreMarketAttentionItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => {
        const body = (
          <div className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20">
            <div className="text-sm font-medium leading-snug">
              {i.symbol ? <span className="font-semibold">{i.symbol} · </span> : null}
              {i.label}
            </div>
            {i.detail && <div className="break-words text-xs text-muted-foreground">{i.detail}</div>}
          </div>
        );
        return i.route ? (
          <Link key={i.id} to={i.route} className="block h-full">
            {body}
          </Link>
        ) : (
          <div key={i.id}>{body}</div>
        );
      })}
    </div>
  );
}
