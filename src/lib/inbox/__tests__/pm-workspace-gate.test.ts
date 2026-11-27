import { describe, expect, it } from "vitest";
import {
  formatPmWorkspaceUnlockEtLabel,
  pmWorkspaceSectionsLocked,
  pmWorkspaceUnlockMins,
  resolvePmWorkspaceGate,
} from "@/lib/inbox/pm-workspace-gate";

describe("PM workspace gate", () => {
  it("unlocks at 3:00 PM ET on a regular trading day", () => {
    expect(pmWorkspaceUnlockMins("2026-11-25")).toBe(900);
    expect(formatPmWorkspaceUnlockEtLabel("2026-11-25")).toBe("3:00 PM ET");
    const before = Date.parse("2026-11-25T19:30:00.000Z"); // 2:30 PM ET (EST)
    const after = Date.parse("2026-11-25T20:05:00.000Z"); // 3:05 PM ET
    expect(pmWorkspaceSectionsLocked(before)).toBe(true);
    expect(pmWorkspaceSectionsLocked(after)).toBe(false);
  });

  it("unlocks at official early close when before 3:00 PM ET", () => {
    expect(pmWorkspaceUnlockMins("2026-11-27")).toBe(780);
    expect(formatPmWorkspaceUnlockEtLabel("2026-11-27")).toBe("1:00 PM ET");
    const before = Date.parse("2026-11-27T17:30:00.000Z"); // 12:30 PM ET
    const after = Date.parse("2026-11-27T18:05:00.000Z"); // 1:05 PM ET
    expect(pmWorkspaceSectionsLocked(before)).toBe(true);
    expect(pmWorkspaceSectionsLocked(after)).toBe(false);
  });

  it("treats Thanksgiving 2026-11-26 as a market holiday (not a regular session)", () => {
    const midday = Date.parse("2026-11-26T17:00:00.000Z");
    expect(pmWorkspaceSectionsLocked(midday)).toBe(false);
    const gate = resolvePmWorkspaceGate(midday);
    expect(gate.consumerIsTradingDay).toBe(false);
    expect(gate.locked).toBe(false);
    expect(gate.body).toMatch(/closed/i);
  });

  it("does not time-gate on weekends", () => {
    const sat = Date.parse("2026-11-28T17:00:00.000Z");
    expect(pmWorkspaceSectionsLocked(sat)).toBe(false);
  });

  it("resolvePmWorkspaceGate unlock label matches boundary", () => {
    const beforeGate = resolvePmWorkspaceGate(Date.parse("2026-11-25T19:45:00.000Z"));
    const afterGate = resolvePmWorkspaceGate(Date.parse("2026-11-25T20:10:00.000Z"));
    expect(beforeGate.locked).toBe(true);
    expect(afterGate.locked).toBe(false);
    expect(beforeGate.unlockLabel).toBe("3:00 PM ET");
  });

  it("does not call a normal 4 PM close an early close on regular days", () => {
    const gate = resolvePmWorkspaceGate(Date.parse("2026-11-25T19:45:00.000Z"));
    expect(gate.unlockLabel).toBe("3:00 PM ET");
    expect(gate.officialCloseLabel).toBe("4:00 PM ET");
    expect(gate.body).not.toMatch(/early close/i);
  });

  it("mentions early close only when unlock precedes 3 PM ET", () => {
    const gate = resolvePmWorkspaceGate(Date.parse("2026-11-27T17:30:00.000Z"));
    expect(gate.body).toMatch(/early close at 1:00 PM ET/i);
  });
});