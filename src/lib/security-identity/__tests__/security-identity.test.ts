import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import {
  createSecurityIdentityStore,
  type SecurityIdentityStore,
} from "@/lib/security-identity/security-identity";
import {
  currentSecuritySymbol,
  resolveSecurityId,
  securitySymbolAt,
} from "@/lib/security-identity/resolve-security-id";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const RECORDED = "2026-09-21T16:00:00.000Z";
const SOURCE_AS_OF = "2026-09-21T15:00:00.000Z";
const OBSERVED = "2026-09-21T15:30:00.000Z";
const FETCHED = "2026-09-21T15:31:00.000Z";

function observation(overrides: Partial<SecurityIdentityObservation> = {}): SecurityIdentityObservation {
  return {
    symbol: "AAA",
    exchange: "NASDAQ",
    effectiveDate: "2024-01-02",
    issuerName: "Alpha Inc",
    source: "reference-feed",
    sourceAsOf: SOURCE_AS_OF,
    observedAt: OBSERVED,
    fetchedAt: FETCHED,
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

function store(): SecurityIdentityStore {
  return createSecurityIdentityStore();
}

describe("Security Identity V1", () => {
  it("1. new security creates a stable securityId that is not the symbol", () => {
    const identity = store();
    const created = resolveSecurityId(identity, observation());
    expect(created.created).toBe(true);
    expect(created.status).toBe("CANDIDATE");
    expect(created.securityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(created.securityId).not.toBe("AAA");
    expect(created.security?.currentSymbol).toBe("AAA");
  });

  it("2. repeated same observation resolves the same securityId", () => {
    const identity = store();
    const first = resolveSecurityId(identity, observation());
    const second = resolveSecurityId(identity, observation({ recordedAt: "2026-09-21T17:00:00.000Z" }));
    expect(second.created).toBe(false);
    expect(second.securityId).toBe(first.securityId);
    expect(identity.listSecurities()).toHaveLength(1);
    expect(identity.listHistory()).toHaveLength(1);
  });

  it("3/4/5. reliable symbol change keeps securityId, closes the old row, and opens the new row", () => {
    const identity = store();
    const created = resolveSecurityId(
      identity,
      observation({ symbol: "OLD", figi: "BBG000000001", effectiveDate: "2020-01-15" }),
    );
    const changed = resolveSecurityId(
      identity,
      observation({
        symbol: "NEW",
        figi: "BBG000000001",
        effectiveDate: "2022-03-01",
        recordedAt: "2026-09-21T18:00:00.000Z",
      }),
    );
    expect(changed.securityId).toBe(created.securityId);
    expect(changed.status).toBe("RESOLVED");
    const rows = identity.listHistory(created.securityId!);
    expect(rows).toEqual([
      expect.objectContaining({
        symbol: "OLD",
        exchange: "NASDAQ",
        effectiveFrom: "2020-01-15",
        effectiveTo: "2022-02-28",
        source: "reference-feed",
        provenance: "PROVIDER",
      }),
      expect.objectContaining({
        symbol: "NEW",
        effectiveFrom: "2022-03-01",
        effectiveTo: null,
      }),
    ]);
    expect(changed.security?.currentSymbol).toBe("NEW");
  });

  it("6/7. point-in-time lookup returns the historical symbol and current lookup returns the open symbol", () => {
    const identity = store();
    const created = resolveSecurityId(
      identity,
      observation({ symbol: "OLD", figi: "BBG000000001", effectiveDate: "2020-01-15" }),
    );
    resolveSecurityId(
      identity,
      observation({ symbol: "NEW", figi: "BBG000000001", effectiveDate: "2022-03-01" }),
    );
    const securityId = created.securityId!;
    expect(securitySymbolAt(identity, securityId, "2019-12-31")).toBeNull();
    expect(securitySymbolAt(identity, securityId, "2022-02-28")?.symbol).toBe("OLD");
    expect(securitySymbolAt(identity, securityId, "2022-03-01")?.symbol).toBe("NEW");
    expect(securitySymbolAt(identity, securityId, "2026-09-21")?.symbol).toBe("NEW");
    expect(currentSecuritySymbol(identity, securityId)?.symbol).toBe("NEW");
    expect(currentSecuritySymbol(identity, securityId)?.symbol).not.toBe("OLD");
  });

  it("8. ambiguous identity does not auto-merge, including same issuer name", () => {
    const identity = store();
    const alpha = resolveSecurityId(
      identity,
      observation({ symbol: "AAA", figi: "BBG00000000A", issuerName: "Shared Name" }),
    );
    const beta = resolveSecurityId(
      identity,
      observation({ symbol: "BBB", figi: "BBG00000000B", issuerName: "Shared Name", exchange: "NYSE" }),
    );
    const conflict = resolveSecurityId(
      identity,
      observation({ symbol: "AAA", figi: "BBG00000000B", exchange: "NASDAQ" }),
    );
    expect(conflict.status).toBe("UNRESOLVED");
    expect(conflict.securityId).toBeNull();
    expect(conflict.created).toBe(false);
    expect(identity.getSecurity(alpha.securityId!)?.currentSymbol).toBe("AAA");
    expect(identity.getSecurity(beta.securityId!)?.currentSymbol).toBe("BBB");
    expect(identity.listHistory(alpha.securityId!)).toHaveLength(1);
    expect(identity.listHistory(beta.securityId!)).toHaveLength(1);

    const sameName = resolveSecurityId(
      identity,
      observation({ symbol: "CCC", figi: null, issuerName: "Shared Name", exchange: "NYSE" }),
    );
    expect(sameName.created).toBe(true);
    expect(sameName.securityId).not.toBe(alpha.securityId);
    expect(sameName.securityId).not.toBe(beta.securityId);
  });

  it("9. missing permanent identifiers are not invented", () => {
    const identity = store();
    const created = resolveSecurityId(
      identity,
      observation({ figi: "  ", compositeFigi: "", cik: null, providerReferenceId: undefined }),
    );
    expect(created.status).toBe("CANDIDATE");
    expect(identity.listIdentifiers(created.securityId!)).toEqual([]);
    const row = identity.listHistory(created.securityId!)[0];
    expect(row.source).toBe("reference-feed");
    expect(row.sourceAsOf).toBe(SOURCE_AS_OF);
    expect(row.observedAt).toBe(OBSERVED);
    expect(row.fetchedAt).toBe(FETCHED);
    expect(row.provenance).toBe("PROVIDER");
  });

  it("10. symbol reuse after the prior history closes creates a different securityId", () => {
    const identity = store();
    const original = resolveSecurityId(
      identity,
      observation({ symbol: "ABC", figi: "BBG0000000AA", effectiveDate: "2020-01-01" }),
    );
    resolveSecurityId(
      identity,
      observation({ symbol: "DEF", figi: "BBG0000000AA", effectiveDate: "2022-01-01" }),
    );
    const reused = resolveSecurityId(
      identity,
      observation({
        symbol: "ABC",
        figi: null,
        issuerName: "Completely Different Issuer",
        effectiveDate: "2024-06-01",
        exchange: "NASDAQ",
      }),
    );
    expect(reused.created).toBe(true);
    expect(reused.securityId).not.toBe(original.securityId);
    expect(securitySymbolAt(identity, original.securityId!, "2021-06-01")?.symbol).toBe("ABC");
    expect(currentSecuritySymbol(identity, original.securityId!)?.symbol).toBe("DEF");
    expect(currentSecuritySymbol(identity, reused.securityId!)?.symbol).toBe("ABC");
  });

  it("11. exchange change with reliable evidence preserves history, and exchange alone does not merge", () => {
    const identity = store();
    const listed = resolveSecurityId(
      identity,
      observation({ symbol: "EXCH", figi: "BBG0000000EX", exchange: "NASDAQ", effectiveDate: "2021-01-04" }),
    );
    const moved = resolveSecurityId(
      identity,
      observation({ symbol: "EXCH", figi: "BBG0000000EX", exchange: "NYSE", effectiveDate: "2023-05-01" }),
    );
    expect(moved.securityId).toBe(listed.securityId);
    const rows = identity.listHistory(listed.securityId!);
    expect(rows[0]).toMatchObject({ exchange: "NASDAQ", effectiveTo: "2023-04-30" });
    expect(rows[1]).toMatchObject({ exchange: "NYSE", effectiveTo: null });
    expect(securitySymbolAt(identity, listed.securityId!, "2022-01-01")?.exchange).toBe("NASDAQ");
    expect(currentSecuritySymbol(identity, listed.securityId!)?.exchange).toBe("NYSE");

    const otherVenue = resolveSecurityId(
      identity,
      observation({ symbol: "EXCH", figi: null, exchange: "AMEX", effectiveDate: "2024-01-02" }),
    );
    expect(otherVenue.securityId).not.toBe(listed.securityId);
    expect(identity.listHistory(listed.securityId!)).toHaveLength(2);
    expect(identity.listHistory(listed.securityId!)[0].exchange).toBe("NASDAQ");
  });

  it("12. screener and Radar modules stay on symbol and volume-first discovery", () => {
    const untouched = [
      "src/lib/screeners/radar-v2-adapter.ts",
      "src/components/dashboard/ScreenerTable.tsx",
      "src/features/day-trade-radar-v2/RadarGrid.tsx",
      "src/features/day-trade-radar-v2/RadarMobileCard.tsx",
    ];
    for (const file of untouched) {
      expect(readFileSync(file, "utf8")).not.toMatch(/security-identity/);
    }
    const migration = readFileSync("drizzle/migrations/0005_security_identity_v1.sql", "utf8");
    expect(migration).not.toMatch(/radar_v2|screener_results|ALTER TABLE public\.screener/i);

    const louder: RadarV2CandidateRow = {
      symbol: "LOUD",
      generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      trading_date: "2026-09-03",
      session_kind: "market",
      lifecycle: "ACTIVE",
      signal_status: "EXPLOSIVE",
      last_price: 10,
      move_15s_pct: 1,
      move_60s_pct: 1,
      volume_5s: 1,
      volume_15s: 1,
      volume_60s: 1,
      session_volume: 50,
      dollar_volume_60s: 1,
      acceleration_5m: 0,
      session_high: 11,
      session_low: 9,
      distance_from_hod_pct: 1,
      session_vwap: 10,
      vwap_side: "above",
      freshness_class: "fresh",
      provider_as_of: "2026-09-03T14:00:00.000Z",
      updated_at: "2026-09-03T14:00:00.000Z",
    };
    const quieter = { ...louder, symbol: "QUIET", session_volume: 5 };
    expect(compareCandidatesVolumeFirst(quieter, louder)).toBeGreaterThan(0);
  });

  it("keeps CIK from merging a different symbol and preserves supplied provenance", () => {
    const identity = store();
    const first = resolveSecurityId(identity, observation({ symbol: "AAA", cik: "0000320193" }));
    const second = resolveSecurityId(
      identity,
      observation({ symbol: "AAPL", cik: "0000320193", exchange: "NASDAQ", issuerName: "Apple" }),
    );
    expect(second.securityId).not.toBe(first.securityId);
    expect(identity.listIdentifiers(first.securityId!).map((row) => row.kind)).toEqual(["CIK"]);
    expect(identity.listIdentifiers(second.securityId!).map((row) => row.value)).toEqual(["0000320193"]);
  });
});
