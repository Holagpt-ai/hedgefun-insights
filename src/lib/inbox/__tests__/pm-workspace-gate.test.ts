import { describe, expect, it } from "vitest";
import {
  formatRegularCloseEtLabel,
  pmWorkspaceSectionsLocked,
} from "@/lib/inbox/pm-workspace-gate";

describe("PM workspace gate", () => {
  it("unlocks after 1:00 PM ET on Nov 27 early-close day", () => {
    const before = Date.parse("2026-11-27T17:30:00.000Z"); // 12:30 PM ET
    const after = Date.parse("2026-11-27T18:05:00.000Z"); // 1:05 PM ET
    expect(pmWorkspaceSectionsLocked(before)).toBe(true);
    expect(pmWorkspaceSectionsLocked(after)).toBe(false);
    expect(formatRegularCloseEtLabel("2026-11-27")).toBe("1:00 PM ET");
  });

  it("keeps 4:00 PM ET close on a regular day", () => {
    expect(formatRegularCloseEtLabel("2026-11-26")).toBe("4:00 PM ET");
    const before = Date.parse("2026-11-26T20:30:00.000Z"); // 3:30 PM ET
    expect(pmWorkspaceSectionsLocked(before)).toBe(true);
  });
});