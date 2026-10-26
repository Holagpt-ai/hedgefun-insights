# Batch 183 — Desktop Day Trade Radar Workspace Tabs V1

**Base:** `origin/main` **`0542ee10`** (Batch **182** merged). No backend deploy.

## Problem

Desktop Day Trade Radar stacked every scanner panel vertically (desk, qualified monitoring, breakouts, penny, carryover) plus repeat movers below, forcing excessive scroll.

## Fix

| Area | Change |
| --- | --- |
| Desktop tabs | `DESKTOP_RADAR_WORKSPACE_TABS` — Live Radar, Momentum, Historical, Signals, Settings |
| Workspace | `MultiRadarWorkspace` shows one tab’s panels at a time; mobile panel tabs unchanged |
| Historical | Carryover panel + Repeat Movers section inside Historical tab (desktop only) |
| Settings | `DesktopRadarSettingsPanel` — persisted sort, filters, columns per scanner panel |
| Storage | `desktopTab` on workspace state (version **3**) |

## Tab mapping (existing components only)

| Tab | Content |
| --- | --- |
| Live Radar | `day_trade` panel (authoritative Top-10 desk) |
| Momentum | `breakouts`, `penny` panels |
| Historical | `carryover` + Repeat Movers |
| Signals | `day_trade_qualified` (monitoring / qualification) |
| Settings | Panel layout preferences (no new scanner features) |

## Out of scope

- New scanner engines or ranking changes
- Mobile layout redesign (existing mobile panel tabs retained)

## Deployment

Vercel SPA after merge only.
