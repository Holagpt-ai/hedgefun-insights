import type { ProcessScoreComponent, ProcessScoreResult, TradeInput } from "./types";

export const PROCESS_SCORE_VERSION = "process-score.v1";

const WEIGHTS = {
  planning: 15,
  risk: 25,
  entry: 10,
  management: 15,
  exit: 10,
  discipline: 20,
  review: 5,
} as const;

function scorePlanning(trade: TradeInput): number | null {
  if (trade.executions.length === 0) return null;
  const checks = [
    Boolean(trade.planned),
    Boolean(trade.thesis),
    trade.plannedEntry != null,
    trade.plannedStop != null,
    trade.plannedTarget != null,
    trade.plannedSize != null,
  ];
  const hits = checks.filter(Boolean).length;
  return Math.round((hits / checks.length) * 100);
}

function scoreRisk(trade: TradeInput): number | null {
  if (trade.executions.length === 0) return null;
  let score = 0;
  if (trade.plannedRisk != null && trade.plannedRisk !== "") score += 40;
  if (trade.plannedStop != null) score += 30;
  if (!trade.ruleDeviation) score += 30;
  else score += 0;
  return score;
}

function scoreEntry(trade: TradeInput): number {
  return trade.playbookId ? 80 : 50;
}

function scoreManagement(trade: TradeInput): number {
  return trade.executions.length > 2 ? 70 : 85;
}

function scoreExit(trade: TradeInput): number {
  return trade.plannedTarget != null ? 75 : 55;
}

function scoreDiscipline(trade: TradeInput): number {
  return trade.ruleDeviation ? 35 : 90;
}

function scoreReview(trade: TradeInput): number {
  return trade.reviewed ? 100 : 0;
}

export function calculateProcessScore(trade: TradeInput): ProcessScoreResult {
  if (trade.executions.length === 0) {
    return {
      total: null,
      state: "unavailable",
      confidence: "low",
      components: [],
      version: PROCESS_SCORE_VERSION,
    };
  }

  const components: ProcessScoreComponent[] = [
    { key: "planning", weight: WEIGHTS.planning, score: scorePlanning(trade), applicable: true },
    { key: "risk", weight: WEIGHTS.risk, score: scoreRisk(trade), applicable: true },
    { key: "entry", weight: WEIGHTS.entry, score: scoreEntry(trade), applicable: true },
    { key: "management", weight: WEIGHTS.management, score: scoreManagement(trade), applicable: true },
    { key: "exit", weight: WEIGHTS.exit, score: scoreExit(trade), applicable: true },
    { key: "discipline", weight: WEIGHTS.discipline, score: scoreDiscipline(trade), applicable: true },
    { key: "review", weight: WEIGHTS.review, score: scoreReview(trade), applicable: true },
  ];

  const applicable = components.filter((item) => item.applicable && item.score != null);
  const weightSum = applicable.reduce((sum, item) => sum + item.weight, 0);
  const total =
    weightSum === 0
      ? null
      : Math.round(
          applicable.reduce((sum, item) => sum + (item.score ?? 0) * item.weight, 0) / weightSum,
        );

  const missing = components.some((item) => item.score == null);
  return {
    total,
    state: missing ? "provisional" : trade.reviewed ? "final" : "provisional",
    confidence: trade.reviewed ? "high" : "medium",
    components,
    version: PROCESS_SCORE_VERSION,
  };
}

export function averageProcessScore(trades: TradeInput[]): number | null {
  const scored = trades
    .map(calculateProcessScore)
    .filter((item) => item.total != null)
    .map((item) => item.total as number);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}
