import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  AM_INDEX_SYMBOLS,
  AM_V2_SOURCE,
  AM_V2_VERSION,
  buildAmV2Snapshot,
  buildMaterialState,
  fingerprintMaterialState,
  isMaterialChange,
  selectDirectCatalysts,
  selectBeforeOpenEarningsEvidence,
  selectRankedHeadlines,
  validateIndexRows,
  type AmEvidenceBundle,
  type AmIndexSymbol,
  type AttributedCatalystRow,
  type IndexSnapshot,
} from "./am-evidence.ts";
import { decideAmGeneration } from "./am-decision.ts";
import { rankHeadlines, type RawHeadline } from "../pre-market/headlines.ts";
import { buildAmUserPrompt, PM_MAX_TOKENS, PM_SYSTEM, AM_MAX_TOKENS } from "./prompts.ts";

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

function bundle(overrides: Partial<AmEvidenceBundle> = {}): AmEvidenceBundle {
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
    ...overrides,
  };
}

function cloneStateFrom(b: AmEvidenceBundle) {
  return buildMaterialState(b);
}

Deno.test("5. first eligible run generates (insert)", () => {
  const d = decideAmGeneration({
    indexesValid: true,
    existing: null,
    incomingState: cloneStateFrom(bundle()),
  });
  assertEquals(d.action, "generate");
  if (d.action === "generate") assertEquals(d.persist, "insert");
});

Deno.test("6. identical evidence does not call provider again", () => {
  const b = bundle();
  const state = cloneStateFrom(b);
  const snap = buildAmV2Snapshot(b, state);
  const d = decideAmGeneration({
    indexesValid: true,
    existing: { id: "row-1", market_snapshot: snap },
    incomingState: cloneStateFrom(b),
  });
  assertEquals(d.action, "return_cached");
});

Deno.test("7. tiny index noise does not regenerate", () => {
  const prev = bundle();
  const next = bundle({
    indexes: idx({ SPY: 0.41, QQQ: 0.6, DIA: 0.2, IWM: -0.1 }),
  });
  const change = isMaterialChange(cloneStateFrom(prev), cloneStateFrom(next));
  assertEquals(change.material, false);
  const d = decideAmGeneration({
    indexesValid: true,
    existing: { id: "row-1", market_snapshot: buildAmV2Snapshot(prev, cloneStateFrom(prev)) },
    incomingState: cloneStateFrom(next),
  });
  assertEquals(d.action, "return_cached");
});

Deno.test("8. index sign flip does regenerate", () => {
  const prev = bundle();
  const next = bundle({
    indexes: idx({ SPY: -0.05, QQQ: 0.6, DIA: 0.2, IWM: -0.1 }),
  });
  const change = isMaterialChange(cloneStateFrom(prev), cloneStateFrom(next));
  assertEquals(change.material, true);
  assert(change.reasons.includes("index_sign_flip:SPY"));
  const d = decideAmGeneration({
    indexesValid: true,
    existing: { id: "row-1", market_snapshot: buildAmV2Snapshot(prev, cloneStateFrom(prev)) },
    incomingState: cloneStateFrom(next),
  });
  assertEquals(d.action, "generate");
  if (d.action === "generate") {
    assertEquals(d.persist, "update");
    assertEquals(d.existingId, "row-1");
  }
});

Deno.test("9. materially new headline does regenerate", () => {
  const prev = bundle();
  const next = bundle({
    headlines: [
      { id: "h2", headline: "Oil jumps after Strait of Hormuz disruption", source: "Wire", published_at: "2026-08-28T08:00:00.000Z", materiality: 70 },
      ...prev.headlines,
    ],
  });
  const change = isMaterialChange(cloneStateFrom(prev), cloneStateFrom(next));
  assertEquals(change.material, true);
  assert(change.reasons.includes("headline_set_change"));
});

Deno.test("10. new direct catalyst does regenerate", () => {
  const prev = bundle();
  const next = bundle({
    catalysts: [
      ...prev.catalysts,
      { id: "c2", symbol: "TSLA", title: "Tesla unveils new robotaxi software", event_date: "2026-08-28", event_type: "product_contract", source_name: "Wire" },
    ],
  });
  const change = isMaterialChange(cloneStateFrom(prev), cloneStateFrom(next));
  assertEquals(change.material, true);
  assert(change.reasons.includes("catalyst_set_change"));
});

function cat(overrides: Partial<AttributedCatalystRow>): AttributedCatalystRow {
  return {
    id: "c-direct",
    symbol: "NVDA",
    title: "NVIDIA announces next-generation data center GPU",
    provider: "polygon",
    event_type: "product_contract",
    event_date: "2026-08-28",
    verification_state: "provider_reported",
    event_time: "2026-08-28T12:00:00.000Z",
    published_at: "2026-08-28T12:00:00.000Z",
    source_name: "Wire",
    attribution_class: "direct",
    ticker_specific: true,
    updated_at: "2026-08-28T12:00:00.000Z",
    ...overrides,
  };
}

Deno.test("11. legal/commentary catalyst does not enter direct-catalyst evidence", () => {
  const rows = [
    cat({
      id: "legal",
      title: "WIX Class Action: Law Firm Reminds Investors of Losses",
    }),
    cat({
      id: "vs",
      symbol: "AMD",
      title: "CBRS vs. AMD: Which Stock Leads the AI Infrastructure Boom?",
    }),
    cat({
      id: "buy",
      symbol: "SPCE",
      title: "Up Nearly 30% in August, Is SpaceX Stock Still a Buy?",
    }),
    cat({
      id: "assoc",
      title: "Analyst notes on the semiconductor group",
      attribution_class: "provider_associated",
    }),
    cat({ id: "real" }),
  ];
  const selected = selectDirectCatalysts(rows);
  assertEquals(selected.map((r) => r.id), ["real"]);
});

Deno.test("12. earnings changes trigger material state change", () => {
  const prev = bundle();
  const next = bundle({
    earnings: [
      ...prev.earnings,
      { id: "e2", symbol: "MSFT", title: "MSFT reports before the open", event_date: "2026-08-28", time_of_day: "before_open" },
    ],
  });
  const change = isMaterialChange(cloneStateFrom(prev), cloneStateFrom(next));
  assertEquals(change.material, true);
  assert(change.reasons.includes("earnings_set_change"));
});

Deno.test("13. missing optional section is omitted, not fabricated", () => {
  const indexesOnly = bundle({ headlines: [], catalysts: [], earnings: [] });
  const prompt = buildAmUserPrompt(indexesOnly);
  assertEquals(prompt.includes("VERIFIED HEADLINES"), false);
  assertEquals(prompt.includes("DIRECT CATALYSTS"), false);
  assertEquals(prompt.includes("BEFORE-OPEN EARNINGS"), false);
  assertEquals(prompt.includes("INDEXES (required)"), true);
  assertEquals(/VERIFIED VOLUME|TOP MOVERS|Day-Trade Radar|screener_results/i.test(prompt), false);
});

Deno.test("14. stale required index evidence fails closed", () => {
  const nowMs = Date.parse("2026-08-28T08:20:00.000Z");
  const staleAt = "2026-08-28T08:00:00.000Z"; // 20 minutes old
  const staleRows = AM_INDEX_SYMBOLS.map((symbol) => ({
    symbol,
    current_value: 100,
    change_percent: 0.2,
    updated_at: staleAt,
  }));
  const staleResult = validateIndexRows(staleRows, nowMs);
  assertEquals(staleResult.ok, false);
  if (!staleResult.ok) assertEquals(staleResult.reason, "source_stale");

  const freshAt = "2026-08-28T08:15:00.000Z";
  const freshRows = AM_INDEX_SYMBOLS.map((symbol) => ({
    symbol,
    current_value: 100,
    change_percent: 0.2,
    updated_at: freshAt,
  }));
  assertEquals(validateIndexRows(freshRows, nowMs).ok, true);

  const missing = freshRows.filter((r) => r.symbol !== "IWM");
  const missingResult = validateIndexRows(missing, nowMs);
  assertEquals(missingResult.ok, false);
  if (!missingResult.ok) assertEquals(missingResult.reason, "source_missing_symbol");

  const d = decideAmGeneration({
    indexesValid: false,
    staleOrMissingReason: "source_stale",
    existing: null,
    incomingState: cloneStateFrom(bundle()),
  });
  assertEquals(d, { action: "fail_closed", reason: "source_stale" });

  const existing = bundle();
  const d2 = decideAmGeneration({
    indexesValid: false,
    staleOrMissingReason: "source_stale",
    existing: { id: "row-1", market_snapshot: buildAmV2Snapshot(existing, cloneStateFrom(existing)) },
    incomingState: cloneStateFrom(existing),
  });
  assertEquals(d2.action, "fail_closed");
});

Deno.test("18. one canonical AM row remains per date/type (update, not insert)", () => {
  const prev = bundle();
  const next = bundle({
    indexes: idx({ SPY: -0.4, QQQ: 0.6, DIA: 0.2, IWM: -0.1 }),
  });
  const d = decideAmGeneration({
    indexesValid: true,
    existing: { id: "canonical-am", market_snapshot: buildAmV2Snapshot(prev, cloneStateFrom(prev)) },
    incomingState: cloneStateFrom(next),
  });
  assertEquals(d.action, "generate");
  if (d.action === "generate") {
    assertEquals(d.persist, "update");
    assertEquals(d.existingId, "canonical-am");
  }
});

Deno.test("legacy AM V1 snapshot is replaced, not served as V2", () => {
  const d = decideAmGeneration({
    indexesValid: true,
    existing: {
      id: "legacy",
      market_snapshot: { source: "market_indexes", source_checked_at: "2026-08-28T10:00:00.000Z" },
    },
    incomingState: cloneStateFrom(bundle()),
  });
  assertEquals(d.action, "generate");
  if (d.action === "generate") assertEquals(d.persist, "update");
});

Deno.test("timestamp-only change is not material (fingerprint ignores checkedAt)", () => {
  const a = bundle({ checkedAt: "2026-08-28T08:00:00.000Z" });
  const b = bundle({ checkedAt: "2026-08-28T08:15:00.000Z" });
  assertEquals(fingerprintMaterialState(cloneStateFrom(a)), fingerprintMaterialState(cloneStateFrom(b)));
  assertEquals(isMaterialChange(cloneStateFrom(a), cloneStateFrom(b)).material, false);
});

Deno.test("selectBeforeOpenEarningsEvidence keeps only confirmed today before_open", () => {
  const rows: AttributedCatalystRow[] = [
    cat({
      id: "bo",
      symbol: "AAPL",
      provider: "earnings_calendar",
      event_type: "earnings",
      time_of_day: "before_open",
      title: "AAPL reports before the open",
    }),
    cat({
      id: "ac",
      symbol: "MSFT",
      provider: "earnings_calendar",
      event_type: "earnings",
      time_of_day: "after_close",
      title: "MSFT reports after close",
    }),
    cat({
      id: "news",
      symbol: "NVDA",
      provider: "polygon",
      event_type: "earnings",
      time_of_day: "before_open",
      title: "NVDA earnings-related news",
    }),
  ];
  const selected = selectBeforeOpenEarningsEvidence(rows, "2026-08-28");
  assertEquals(selected.map((r) => r.id), ["bo"]);
});

Deno.test("headline ranking prefers macro over isolated company PR", () => {
  const raw: RawHeadline[] = [
    {
      id: "pr",
      headline: "Acme Corp announces share repurchase program",
      source: "PR",
      url: "https://example.com/pr",
      published_at: "2026-08-28T08:00:00.000Z",
    },
    {
      id: "fed",
      headline: "Fed signals patience on interest rates as Treasury yields fall",
      source: "Wire",
      url: "https://example.com/fed",
      published_at: "2026-08-28T07:50:00.000Z",
    },
  ];
  const ranked = rankHeadlines(raw, 12);
  const selected = selectRankedHeadlines(ranked);
  assertEquals(selected[0]?.id, "fed");
  assertEquals(selected.some((h) => h.id === "pr"), false);
});

Deno.test("17. PM token/prompt contract remains four-ETF-only", () => {
  assertEquals(PM_MAX_TOKENS, 350);
  assert(AM_MAX_TOKENS > PM_MAX_TOKENS);
  assert(PM_SYSTEM.includes("You MUST NOT reference or invent"));
  assert(PM_SYSTEM.includes("News headlines"));
  assert(PM_SYSTEM.includes("four ETF proxies"));
  assertEquals(PM_SYSTEM.includes("Overnight / Macro"), false);
});

Deno.test("AM V2 snapshot stores version/source/fingerprint without radar fields", () => {
  const snap = buildAmV2Snapshot(bundle(), cloneStateFrom(bundle()));
  assertEquals(snap.version, AM_V2_VERSION);
  assertEquals(snap.source, AM_V2_SOURCE);
  assert(typeof snap.fingerprint === "string" && (snap.fingerprint as string).length > 0);
  const json = JSON.stringify(snap);
  assertEquals(json.includes("screener"), false);
  assertEquals(json.includes("day_trade"), false);
});
