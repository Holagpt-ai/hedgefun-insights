import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  validateAmV2Provenance,
  validateBriefProvenance,
  validatePmV1Provenance,
  type BriefRowLike,
} from "./provenance.ts";
import { AM_V2_SOURCE, AM_V2_VERSION, buildAmV2Snapshot, buildMaterialState } from "./am-evidence.ts";

function amRow(snapshot: unknown, overrides: Partial<BriefRowLike> = {}): BriefRowLike {
  return {
    brief_type: "am",
    brief_date: "2026-08-28",
    content: "### Market Bias\n- SPY and QQQ are higher.",
    generated_at: "2026-08-28T08:12:00.000Z",
    market_snapshot: snapshot,
    ...overrides,
  };
}

function validAmSnapshot() {
  const bundle = {
    checkedAt: "2026-08-28T08:10:00.000Z",
    indexes: {
      SPY: { current_value: 500, change_percent: 0.4, updated_at: "2026-08-28T08:05:00.000Z" },
      QQQ: { current_value: 400, change_percent: 0.6, updated_at: "2026-08-28T08:05:00.000Z" },
      DIA: { current_value: 300, change_percent: 0.2, updated_at: "2026-08-28T08:05:00.000Z" },
      IWM: { current_value: 200, change_percent: -0.1, updated_at: "2026-08-28T08:05:00.000Z" },
    },
    headlines: [] as [],
    catalysts: [] as [],
    earnings: [] as [],
  };
  return buildAmV2Snapshot(bundle, buildMaterialState(bundle));
}

Deno.test("15. AM V2 provenance validates", () => {
  const v = validateAmV2Provenance(amRow(validAmSnapshot()));
  assertEquals(v.ok, true);
  if (v.ok) assertEquals(v.sourceCheckedAt, "2026-08-28T08:10:00.000Z");
  const via = validateBriefProvenance(amRow(validAmSnapshot()), "am");
  assertEquals(via.ok, true);
});

Deno.test("16. invalid / legacy AM provenance fails closed", () => {
  const legacy = amRow({
    source: "market_indexes",
    source_checked_at: "2026-08-28T10:00:00.000Z",
    symbols: { SPY: { current_value: 1, change_percent: 0 } },
  });
  assertEquals(validateAmV2Provenance(legacy).ok, false);

  const missingFingerprint = validAmSnapshot();
  delete (missingFingerprint as { fingerprint?: string }).fingerprint;
  assertEquals(validateAmV2Provenance(amRow(missingFingerprint)).ok, false);

  const wrongVersion = { ...validAmSnapshot(), version: "am_v1" };
  assertEquals(validateAmV2Provenance(amRow(wrongVersion)).ok, false);

  const emptyContent = amRow(validAmSnapshot(), { content: "   " });
  assertEquals(validateAmV2Provenance(emptyContent).ok, false);

  const malformedIndexes = { ...validAmSnapshot(), indexes: {} };
  assertEquals(validateAmV2Provenance(amRow(malformedIndexes)).ok, false);

  assertEquals(validateAmV2Provenance(amRow(null)).ok, false);
});

Deno.test("17. PM V1 market_indexes provenance remains valid", () => {
  const pm: BriefRowLike = {
    brief_type: "pm",
    brief_date: "2026-08-28",
    content: "SPY finished higher. QQQ led. IWM lagged.",
    generated_at: "2026-08-28T20:20:00.000Z",
    market_snapshot: {
      source: "market_indexes",
      source_checked_at: "2026-08-28T20:16:00.000Z",
      symbols: {
        SPY: { current_value: 500, change_percent: 0.4, updated_at: "2026-08-28T20:15:00.000Z" },
      },
    },
  };
  const v = validatePmV1Provenance(pm);
  assertEquals(v.ok, true);
  const via = validateBriefProvenance(pm, "pm");
  assertEquals(via.ok, true);

  const amMasquerade: BriefRowLike = { ...pm, brief_type: "am" };
  assertEquals(validateBriefProvenance(amMasquerade, "am").ok, false);

  const pmAsAmSource: BriefRowLike = {
    ...pm,
    market_snapshot: { source: AM_V2_SOURCE, version: AM_V2_VERSION },
  };
  assertEquals(validatePmV1Provenance(pmAsAmSource).ok, false);
});
