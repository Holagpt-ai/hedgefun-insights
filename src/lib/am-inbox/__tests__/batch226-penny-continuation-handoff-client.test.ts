import { describe, expect, it } from "vitest";
import {
  mapPersistedPennyHandoffRow,
  mapPersistedPennyHandoffRows,
  type PersistedPennyContinuationHandoffRow,
} from "@/lib/am-inbox/penny-continuation-handoff-persistence";
import { matchPennyContinuationBadgesToAmInbox } from "@/lib/am-inbox/penny-continuation-badge-match";
import type { AmInboxPennyBadgeMatchTarget } from "@/lib/am-inbox/penny-continuation-workflow-types";

const SESSION = "2026-11-11";

function persistedRow(
  overrides: Partial<PersistedPennyContinuationHandoffRow> = {},
): PersistedPennyContinuationHandoffRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    security_id: null,
    symbol: "PNY",
    source_session_date: SESSION,
    capture_at: "2026-11-11T15:00:00.000Z",
    symbol_observation_at: "2026-11-11T14:59:55.000Z",
    handoff_version: "penny_continuation_workflow_handoff_v1",
    integration_version: "penny_continuation_integration_v1",
    model_version: "penny_continuation_v1",
    publication_idempotency_key: `${SESSION}:PNY:penny_continuation_v1:gen:1`,
    observation_generation_id: "gen",
    generation_sync_ms: 1_700_000_000_000,
    generation_sync_at: "2023-11-14T22:13:20.000Z",
    continuation_qualified: true,
    publication_suppressed: false,
    qualification_evidence_kind: "live_market",
    valid_from_session_date: SESSION,
    valid_through_session_date: SESSION,
    badge_payload: {
      kind: "penny_continuation_v1",
      symbol: "PNY",
      sessionDate: SESSION,
      continuationQualified: true,
      corePassCount: 4,
      dataFreshnessLabel: "live",
      score: 80,
      supplementalLabels: [],
      model_version: "penny_continuation_v1",
    },
    rank_snapshot: {
      core_pass_count: 4,
      score: 80,
      data_freshness_label: "live",
      rank_keys: {
        sharesPerMinute: 30_000,
        sessionVolume: 1_000_000,
        dollarVolume: 400_000,
      },
      supplemental_labels: [],
    },
    revoked_at: null,
    ...overrides,
  };
}

describe("batch226 penny persistence client", () => {
  it("maps persisted row to workflow handoff", () => {
    const mapped = mapPersistedPennyHandoffRow(persistedRow());
    expect(mapped?.symbol).toBe("PNY");
    expect(mapped?.publicationIdempotencyKey).toContain("gen");
  });

  it("drops revoked rows", () => {
    expect(
      mapPersistedPennyHandoffRow(
        persistedRow({ revoked_at: "2026-11-11T16:00:00.000Z" }),
      ),
    ).toBeNull();
    expect(mapPersistedPennyHandoffRows([
      persistedRow(),
      persistedRow({ revoked_at: "2026-11-11T16:00:00.000Z" }),
    ])).toHaveLength(1);
  });

  it("feeds badge matcher after map", () => {
    const handoffs = mapPersistedPennyHandoffRows([persistedRow()]);
    const target: AmInboxPennyBadgeMatchTarget = {
      candidateKey: "c1",
      symbol: "PNY",
      sourceSessionDate: SESSION,
      expiryState: "active",
      sourceCategories: ["POWER_HOUR_MOMENTUM"],
      securityId: null,
    };
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs,
      candidates: [target],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(1);
  });
});
