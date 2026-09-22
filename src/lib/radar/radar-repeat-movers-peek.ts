import type { RadarRepeatMoversView } from "@/lib/radar/radar-repeat-movers-types";

let lastRepeatMoversView: RadarRepeatMoversView | null = null;

export function recordRadarRepeatMoversView(view: RadarRepeatMoversView): void {
  lastRepeatMoversView = view;
}

export function peekRadarRepeatMoversView(): RadarRepeatMoversView | null {
  return lastRepeatMoversView;
}

export function resetRadarRepeatMoversViewPeek(): void {
  lastRepeatMoversView = null;
}
