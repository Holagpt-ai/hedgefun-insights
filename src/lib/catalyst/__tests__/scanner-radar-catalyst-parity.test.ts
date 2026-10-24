import { describe, expect, it } from "vitest";
import { RADAR_CATALYST_SURFACING } from "../../../../supabase/functions/_shared/radar-v22/scanner-catalyst-surfacing";

describe("scanner/radar catalyst parity contract", () => {
  it("keeps catalyst surfacing on the client enrichment path", () => {
    expect(RADAR_CATALYST_SURFACING).toBe("client_enrichment_only");
  });
});
