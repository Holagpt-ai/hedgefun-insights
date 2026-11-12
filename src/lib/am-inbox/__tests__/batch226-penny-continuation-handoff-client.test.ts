import { describe, expect, it } from "vitest";
import type { ContinuationCategory } from "@/config/continuation.config";
import { matchPennyContinuationBadgesToAmInbox } from "@/lib/am-inbox/penny-continuation-badge-match";
import {
  mapPennyHandoffReadProjection,
  mapPennyHandoffReadProjections,
  type PennyContinuationHandoffReadProjection,
} from "@/lib/am-inbox/penny-continuation-handoff-persistence";
import type { AmInboxPennyBadgeMatchTarget } from "@/lib/am-inbox/penny-continuation-workflow-types";

const SESSION = "2026-11-11";

function readProjection(
  overrides: Partial<PennyContinuationHandoffReadProjection> = {},
): PennyContinuationHandoffReadProjection {
  return {
    projection_version: "penny_continuation_handoff_read_v1",
    handoff_version: "penny_continuation_workflow_handoff_v1",
    integration_version: "penny_continuation_integration_v1",
    model_version: "penny_continuation_v1",
    symbol: "PNY",
    source_session_date: SESSION,
    capture_at: "2026-11-11T15:00:00.000Z",
    symbol_observation_at: "2026-11-11T14:59:55.000Z",
    publication_idempotency_key: `${SESSION}:PNY:penny_continuation_v1:gen:1`,
    publication_suppressed: false,
    qualification_evidence_kind: "live_market",
    continuation_qualified: true,
    badge_payload: {
      kind: "penny_continuation_v1",
      symbol: "PNY",
      sessionDate: SESSION,
      continuationQualified: true,
      corePassCount: 4,
      dataFreshnessLabel: "delayed",
      score: 80,
      supplementalLabels: [],
      model_version: "penny_continuation_v1",
    },
    rank_snapshot: {
      core_pass_count: 4,
      score: 80,
      rank_keys: {
        sharesPerMinute: 30_000,
        sessionVolume: 1_000_000,
        dollarVolume: 400_000,
      },
      supplemental_labels: [],
    },
    ...overrides,
  };
}

describe("batch226 penny persistence client", () => {
  it("maps read projection to workflow handoff", () => {
    const mapped = mapPennyHandoffReadProjection(readProjection());
    expect(mapped?.symbol).toBe("PNY");
    expect(mapped?.dataFreshnessLabel).toBe("delayed");
  });

  it("drops unqualified projections", () => {
    expect(
      mapPennyHandoffReadProjection(
        readProjection({ continuation_qualified: false }),
      ),
    ).toBeNull();
    expect(mapPennyHandoffReadProjections([
      readProjection(),
      readProjection({ continuation_qualified: false }),
    ])).toHaveLength(1);
  });

  it("feeds badge matcher from projections", () => {
    const handoffs = mapPennyHandoffReadProjections([readProjection()]);
    const target: AmInboxPennyBadgeMatchTarget = {
      candidateKey: "c1",
      symbol: "PNY",
      sourceSessionDate: SESSION,
      expiryState: "active",
      sourceCategories: ["POWER_HOUR_MOMENTUM"] as readonly ContinuationCategory[],
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
