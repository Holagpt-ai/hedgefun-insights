import { describe, expect, it } from "vitest";
import {
  DESKTOP_RADAR_WORKSPACE_TABS,
  panelIdsForDesktopTab,
} from "../desktop-radar-workspace-tabs";
import { defaultWorkspaceState } from "../multi-radar";

describe("Batch 183 desktop radar workspace tabs", () => {
  it("maps each tab to existing scanner panels without placeholders", () => {
    expect(DESKTOP_RADAR_WORKSPACE_TABS.map((t) => t.id)).toEqual([
      "live",
      "momentum",
      "historical",
      "signals",
      "settings",
    ]);
    expect(panelIdsForDesktopTab("live", true)).toEqual(["day_trade"]);
    expect(panelIdsForDesktopTab("momentum", true)).toEqual(["breakouts", "penny"]);
    expect(panelIdsForDesktopTab("historical", true)).toEqual(["carryover"]);
    expect(panelIdsForDesktopTab("signals", true)).toEqual(["day_trade_qualified"]);
    expect(panelIdsForDesktopTab("settings", true)).toEqual([]);
  });

  it("defaults workspace storage with desktop tab live", () => {
    const state = defaultWorkspaceState();
    expect(state.desktopTab).toBe("live");
    expect(state.version).toBe(3);
  });

  it("keeps carryover when live panels are hidden", () => {
    expect(panelIdsForDesktopTab("historical", false)).toEqual(["carryover"]);
    expect(panelIdsForDesktopTab("live", false)).toEqual([]);
  });
});
