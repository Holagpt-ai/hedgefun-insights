// Public Catalyst Intelligence V1A surface.
// Boundary: normalized events -> intelligence -> AlertEvent -> Notification Router.

export { SCORING_VERSION } from "./types.ts";
export type {
  AlertEvent,
  CatalystClassification,
  CatalystDirection,
  CatalystIntelligenceRecord,
  EvidenceTrail,
  FactState,
  NormalizedCatalystInput,
  NotificationRouter,
  ScoreBreakdown,
} from "./types.ts";

export {
  FLAG_ENV_KEYS,
  V1A_MANDATORY_FLAGS,
  failClosedFlags,
  readCatalystFlags,
} from "./flags.ts";
export type { CatalystFlags } from "./flags.ts";

export { classifyIntelligence, looksLikeCommentaryHeadline } from "./classify.ts";
export { COMMENTARY_SCORE_CAP, HIGH_PRIORITY_THRESHOLD, scoreIntelligence } from "./score.ts";
export { qualifyForAlert } from "./qualify.ts";
export { alertDedupeKey, buildAlertEvent, createMemoryAlertQueue, emitAlertEvent } from "./alerts.ts";
export { createNotificationRouter, DELIVERY_DISABLED_REASON } from "./router.ts";
export { executeProviderAdapter, listExecutableAdapters } from "./adapters.ts";
export { evaluateCatalystIntelligence, runIntelligencePipeline } from "./pipeline.ts";
export { shadowLogIntelligence } from "./shadow.ts";
