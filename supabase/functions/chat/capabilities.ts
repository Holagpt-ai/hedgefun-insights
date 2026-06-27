export interface TierCapabilities {
  memory: boolean;
  webSearch: boolean;
  tools: string[];
  models: string[];
}

const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";
const MODEL_OPUS = "claude-opus-4-8";

const TIER_CAPABILITIES: Record<string, TierCapabilities> = {
  free: {
    memory: false,
    webSearch: false,
    tools: [],
    models: [MODEL_HAIKU],
  },
  pro: {
    memory: true,
    webSearch: false,
    tools: ["get_journal_stats", "get_recent_trades"],
    models: [MODEL_HAIKU, MODEL_SONNET],
  },
  unlimited: {
    memory: true,
    webSearch: false,
    tools: ["get_journal_stats", "get_recent_trades"],
    models: [MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS],
  },
  admin: {
    memory: true,
    webSearch: false,
    tools: ["get_journal_stats", "get_recent_trades"],
    models: [MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS],
  },
};

export function getCapabilities(plan: string): TierCapabilities {
  return TIER_CAPABILITIES[plan] ?? TIER_CAPABILITIES["free"];
}
