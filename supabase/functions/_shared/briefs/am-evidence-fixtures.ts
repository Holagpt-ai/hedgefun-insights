import { emptyEnrichment } from "./am-enrichment.ts";
import type { AmEvidenceBundle, AmIndexSymbol, IndexSnapshot } from "./am-evidence.ts";
import { AM_INDEX_SYMBOLS } from "./am-evidence.ts";

function idx(
  pct: Record<AmIndexSymbol, number>,
  value = 100,
  updatedAt = "2026-08-28T08:05:00.000Z",
): Record<AmIndexSymbol, IndexSnapshot> {
  const out = {} as Record<AmIndexSymbol, IndexSnapshot>;
  for (const s of AM_INDEX_SYMBOLS) {
    out[s] = { current_value: value, change_percent: pct[s], updated_at: updatedAt };
  }
  return out;
}

export function amEvidenceFixture(overrides: Partial<AmEvidenceBundle> = {}): AmEvidenceBundle {
  return {
    checkedAt: "2026-08-28T08:10:00.000Z",
    indexes: idx({ SPY: 0.4, QQQ: 0.6, DIA: 0.2, IWM: -0.1 }),
    headlines: [
      { id: "h1", headline: "Fed signals patience on rates", source: "Wire", published_at: "2026-08-28T07:00:00.000Z", materiality: 60 },
    ],
    catalysts: [
      { id: "c1", symbol: "NVDA", title: "NVIDIA announces next-generation data center GPU", event_date: "2026-08-28", event_type: "product_contract", source_name: "Wire" },
    ],
    earnings: [
      { id: "e1", symbol: "AAPL", title: "AAPL reports before the open", event_date: "2026-08-28", time_of_day: "before_open" },
    ],
    continuationCarryovers: [],
    enrichment: emptyEnrichment("none"),
    ...overrides,
  };
}
