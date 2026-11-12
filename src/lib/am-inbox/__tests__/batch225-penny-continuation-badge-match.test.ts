import { describe, expect, it } from "vitest";
import type { ContinuationCategory } from "@/config/continuation.config";
import { matchPennyContinuationBadgesToAmInbox } from "@/lib/am-inbox/penny-continuation-badge-match";
import type {
  AmInboxPennyBadgeMatchTarget,
  PennyContinuationWorkflowHandoff,
} from "@/lib/am-inbox/penny-continuation-workflow-types";
import {
  pennyContinuationNavigatePath,
  pennyContinuationWorkflowRoutes,
} from "@/lib/am-inbox/penny-continuation-workflow-navigation";
import { buildHistoricalWorkflowContext } from "@/lib/historical-workflow/build-historical-workflow-context";
import { persistHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";

const SECURITY_ID = "22222222-2222-4222-8222-222222222222" as const;
const SESSION = "2026-11-11";
const NEXT = "2026-11-12";

function categories(): readonly ContinuationCategory[] {
  return ["POWER_HOUR_MOMENTUM"];
}

function inboxTarget(
  overrides: Partial<AmInboxPennyBadgeMatchTarget> = {},
): AmInboxPennyBadgeMatchTarget {
  return {
    candidateKey: "cand-pny",
    symbol: "PNY",
    sourceSessionDate: SESSION,
    expiryState: "active",
    sourceCategories: categories(),
    securityId: SECURITY_ID,
    ...overrides,
  };
}

function handoff(
  overrides: Partial<PennyContinuationWorkflowHandoff> = {},
): PennyContinuationWorkflowHandoff {
  return {
    handoff_version: "penny_continuation_workflow_handoff_v1",
    integration_version: "penny_continuation_integration_v1",
    model_version: "penny_continuation_v1",
    symbol: "PNY",
    sourceSessionDate: SESSION,
    symbolObservationIso: "2026-11-11T14:59:55.000Z",
    captureIso: "2026-11-11T15:00:00.000Z",
    continuationQualified: true,
    corePassCount: 5,
    score: 88,
    rankKeys: {
      sharesPerMinute: 40_000,
      sessionVolume: 2_000_000,
      dollarVolume: 1_700_000,
    },
    dataFreshnessLabel: "live",
    supplementalLabels: [],
    publicationIdempotencyKey: `${SESSION}:PNY:penny_continuation_v1:gen:1`,
    publicationSuppressed: false,
    badge: {
      kind: "penny_continuation_v1",
      symbol: "PNY",
      sessionDate: SESSION,
      continuationQualified: true,
      corePassCount: 5,
      dataFreshnessLabel: "live",
      score: 88,
      supplementalLabels: [],
      model_version: "penny_continuation_v1",
    },
    qualificationEvidenceKind: "live_market",
    stableRankingKey: "rk-1",
    ...overrides,
  };
}

describe("Batch 225 penny continuation badge match", () => {
  it("matches one badge to an existing AM Inbox row by symbol and session date", () => {
    const candidate = inboxTarget();
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff()],
      candidates: [candidate],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].matchedCandidateKey).toBe("cand-pny");
    expect(result.attachments[0].badge.kind).toBe("penny_continuation_v1");
    expect(result.candidates[0].sourceCategories).toEqual(categories());
  });

  it("does not match wrong symbol or source date", () => {
    const wrongSymbol = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ symbol: "ZZZ" })],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(wrongSymbol.attachments).toHaveLength(0);

    const wrongDate = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ sourceSessionDate: "2026-11-10" })],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(wrongDate.attachments).toHaveLength(0);
  });

  it("does not attach duplicate badges for duplicate handoff keys", () => {
    const h = handoff();
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [h, h],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.unmatchedHandoffKeys.length).toBeGreaterThanOrEqual(1);
  });

  it("skips expired AM Inbox candidates", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff()],
      candidates: [inboxTarget({ expiryState: "expired" })],
      amSessionDate: NEXT,
    });
    expect(result.attachments).toHaveLength(0);
  });

  it("labels prior-session capture and allows badge on next AM session", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ qualificationEvidenceKind: "prior_session_capture" })],
      candidates: [inboxTarget({ sourceSessionDate: SESSION, expiryState: "active" })],
      amSessionDate: NEXT,
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].qualificationEvidenceKind).toBe("prior_session_capture");
  });

  it("rejects live-market handoff on mismatched AM session", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ qualificationEvidenceKind: "live_market" })],
      candidates: [inboxTarget()],
      amSessionDate: NEXT,
    });
    expect(result.attachments).toHaveLength(0);
  });

  it("attaches badge when publicationSuppressed (notification only)", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ publicationSuppressed: true })],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].publicationSuppressed).toBe(true);
  });

  it("unqualified handoff produces no badge attachment", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ continuationQualified: false, badge: null })],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(0);
  });

  it("rejects mismatched badge session date vs handoff", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [
        handoff({
          badge: {
            ...handoff().badge!,
            sessionDate: "2026-11-10",
          },
        }),
      ],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(0);
  });

  it("rejects stale handoff freshness for badge attach", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ dataFreshnessLabel: "stale" })],
      candidates: [inboxTarget()],
      amSessionDate: SESSION,
    });
    expect(result.attachments).toHaveLength(0);
  });

  it("prior-session capture still matches on next AM session when active", () => {
    const result = matchPennyContinuationBadgesToAmInbox({
      handoffs: [handoff({ qualificationEvidenceKind: "prior_session_capture" })],
      candidates: [inboxTarget()],
      amSessionDate: NEXT,
    });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].qualificationEvidenceKind).toBe("prior_session_capture");
  });

  it("symbol-only navigation ignores cached workflow securityId", () => {
    const STALE_ID = "99999999-9999-4999-8999-999999999999" as const;
    persistHistoricalWorkflowContext(
      buildHistoricalWorkflowContext({
        symbol: "PNY",
        securityId: STALE_ID,
        sourceSurface: "inbox",
      }),
    );
    const routes = pennyContinuationWorkflowRoutes({
      symbol: "PNY",
      securityId: null,
    });
    expect(routes?.catalyst).toContain("symbol=PNY");
    expect(routes?.catalyst).not.toContain(STALE_ID);
    const path = pennyContinuationNavigatePath("catalyst", {
      symbol: "PNY",
      securityId: null,
    });
    expect(path).not.toContain(STALE_ID);
  });

  it("uses verified securityId from AM Inbox row when present", () => {
    const routes = pennyContinuationWorkflowRoutes(inboxTarget());
    expect(routes?.catalyst).toContain(SECURITY_ID);
    const path = pennyContinuationNavigatePath("catalyst", inboxTarget());
    expect(path).toContain(SECURITY_ID);
  });
});
