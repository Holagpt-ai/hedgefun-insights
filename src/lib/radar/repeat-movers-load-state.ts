import type { RadarRepeatMoversView } from "@/lib/radar/radar-repeat-movers-types";

export type RepeatMoversLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; view: RadarRepeatMoversView }
  | {
    status: "unavailable";
    reason: "no_session" | "enrichment_failed" | "view_build_failed" | "service_http_error";
  }
  | { status: "error"; reason: "render_failed" };

export const REPEAT_MOVERS_IDLE: RepeatMoversLoadState = { status: "idle" };
