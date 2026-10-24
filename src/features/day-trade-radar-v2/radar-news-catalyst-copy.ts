import {
  RADAR_CATALYST_LEVEL_LABEL,
  RADAR_UNVERIFIED_NEWS_LABEL,
} from "@/lib/catalyst/radar-momentum-catalyst-context";
import type { RadarNewsDisplay } from "./radar-news-display";

export function radarNewsLevelHeading(display: RadarNewsDisplay): string {
  if (display.level === "catalyst") {
    return RADAR_CATALYST_LEVEL_LABEL[display.association];
  }
  if (display.level === "recent") return RADAR_UNVERIFIED_NEWS_LABEL;
  return "";
}

export function radarNewsMetaLine(display: Extract<RadarNewsDisplay, { level: "catalyst" | "recent" }>): string {
  if (display.level === "catalyst") {
    return [display.category, display.sourceAttribution, display.ageLabel].filter(Boolean).join(" · ");
  }
  return [display.source, display.ageLabel].filter(Boolean).join(" · ");
}
