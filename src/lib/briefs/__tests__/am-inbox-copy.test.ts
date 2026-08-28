import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  AM_AI_BRIEF_GATE_BODY,
  AM_INBOX_CONFIG,
  PM_AI_BRIEF_GATE_BODY,
  PM_INBOX_CONFIG,
} from "@/config/inbox.config";

describe("AM Intelligence Brief V2 inbox copy", () => {
  it("uses Updated at for the AM card timestamp", () => {
    expect(AM_INBOX_CONFIG.aiCardTimestampLabel).toBe("Updated at");
  });

  it("keeps Generated at for the PM card timestamp", () => {
    expect(PM_INBOX_CONFIG.aiCardTimestampLabel).toBe("Generated at");
  });

  it("describes AM V2 evidence in the AM gate body", () => {
    expect(AM_AI_BRIEF_GATE_BODY).toBe(
      "A shared pre-market intelligence brief grounded in current index, headline, catalyst, and earnings evidence.",
    );
    expect(AM_INBOX_CONFIG.aiCardGateBody).toBe(AM_AI_BRIEF_GATE_BODY);
  });

  it("keeps the four-ETF PM gate body", () => {
    expect(PM_AI_BRIEF_GATE_BODY).toBe(
      "A shared AI market brief grounded in SPY, QQQ, DIA, and IWM.",
    );
  });

  it("Action Center uses AM V2 copy for AM and four-ETF copy for PM", () => {
    const src = readFileSync("src/pages/dashboard/ActionCenter.tsx", "utf8");
    expect(src).toContain("AM_AI_BRIEF_GATE_BODY");
    expect(src).toContain("PM_AI_BRIEF_GATE_BODY");
    expect(src).toContain("ac.briefType === \"am\" ? AM_AI_BRIEF_GATE_BODY : PM_AI_BRIEF_GATE_BODY");
    expect(src).not.toContain(
      'aiCardGateBody: "A shared AI market brief grounded in SPY, QQQ, DIA, and IWM."',
    );
  });
});
