import { describe, it, expect } from "vitest";
import { AM_INBOX_CONFIG, PM_INBOX_CONFIG } from "@/config/inbox.config";

describe("AM Intelligence Brief V2 inbox copy", () => {
  it("uses Updated at for the AM card timestamp", () => {
    expect(AM_INBOX_CONFIG.aiCardTimestampLabel).toBe("Updated at");
  });

  it("keeps Generated at for the PM card timestamp", () => {
    expect(PM_INBOX_CONFIG.aiCardTimestampLabel).toBe("Generated at");
  });
});
