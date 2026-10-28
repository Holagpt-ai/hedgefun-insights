import { describe, expect, it } from "vitest";
import { resolveAmInboxSessionDate } from "@/lib/am-inbox/resolve-am-inbox-session-date";

describe("resolveAmInboxSessionDate", () => {
  it("uses workspace et_date when valid ISO", () => {
    expect(resolveAmInboxSessionDate("2026-10-27", 0)).toBe("2026-10-27");
  });

  it("falls back to Eastern calendar date when workspace date missing", () => {
    const resolved = resolveAmInboxSessionDate(undefined, Date.UTC(2026, 9, 27, 14));
    expect(resolved).toBe("2026-10-27");
  });
});
