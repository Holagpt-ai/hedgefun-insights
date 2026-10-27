import type { RadarPanelId } from "./multi-radar";

export type DesktopRadarWorkspaceTabId =
  | "live"
  | "momentum"
  | "historical"
  | "signals"
  | "settings";

export interface DesktopRadarWorkspaceTab {
  id: DesktopRadarWorkspaceTabId;
  label: string;
  /** Existing scanner panels shown in this tab (empty for settings). */
  panelIds: readonly RadarPanelId[];
  /** When true, the tab also renders optional historical extras (repeat movers). */
  includesHistoricalExtras?: boolean;
}

export const DESKTOP_RADAR_WORKSPACE_TABS: readonly DesktopRadarWorkspaceTab[] = [
  {
    id: "live",
    label: "Live Radar",
    panelIds: ["day_trade"],
  },
  {
    id: "momentum",
    label: "Momentum",
    panelIds: ["breakouts", "penny"],
  },
  {
    id: "historical",
    label: "Historical",
    panelIds: ["carryover"],
    includesHistoricalExtras: true,
  },
  {
    id: "signals",
    label: "Signals",
    panelIds: ["day_trade_qualified"],
  },
  {
    id: "settings",
    label: "Settings",
    panelIds: [],
  },
] as const;

const TAB_IDS = new Set<string>(DESKTOP_RADAR_WORKSPACE_TABS.map((tab) => tab.id));

export function isDesktopRadarWorkspaceTabId(value: unknown): value is DesktopRadarWorkspaceTabId {
  return typeof value === "string" && TAB_IDS.has(value);
}

export function desktopRadarTabById(id: DesktopRadarWorkspaceTabId): DesktopRadarWorkspaceTab {
  return DESKTOP_RADAR_WORKSPACE_TABS.find((tab) => tab.id === id) ?? DESKTOP_RADAR_WORKSPACE_TABS[0];
}

export function panelIdsForDesktopTab(
  tabId: DesktopRadarWorkspaceTabId,
  livePanelsVisible: boolean,
): readonly RadarPanelId[] {
  const tab = desktopRadarTabById(tabId);
  if (tabId === "settings") return [];
  if (!livePanelsVisible) {
    return tab.panelIds.filter((id) => id === "carryover");
  }
  return tab.panelIds;
}
