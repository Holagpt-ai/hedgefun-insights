// V1 priority is a documented weighted blend of inspectable components.
// Observed reaction is optional. An upcoming event with strong evidence and
// materiality can outrank a weak story that already moved.
//
// When reaction_score is null:
//   priority = 0.30*evidence + 0.35*materiality + 0.25*timing + 0.10*attribution
// When reaction_score is present:
//   priority = 0.25*evidence + 0.30*materiality + 0.20*timing + 0.10*attribution + 0.15*reaction
//
// attribution input is confidence (0-1) scaled to 0-100.
// Weights are fixed for V1 and stored on the event as score_components.

import type { CatalystState, LifecycleState, VerificationState } from "./types.ts";

export interface ScoreInput {
  evidenceConfidence: number;
  materiality: number;
  timingUrgency: number;
  attributionConfidence: number;
  reactionScore: number | null;
  verification: VerificationState;
  lifecycle: LifecycleState;
}

export interface ScoreResult {
  priority: number;
  state: CatalystState;
  components: Record<string, unknown>;
}

export function catalystPriority(input: ScoreInput): ScoreResult {
  const attribution = Math.round(input.attributionConfidence * 100);
  const reaction = input.reactionScore;
  let priority: number;
  let weights: Record<string, number>;
  if (reaction == null) {
    weights = { evidence: 0.3, materiality: 0.35, timing: 0.25, attribution: 0.1, reaction: 0 };
    priority = input.evidenceConfidence * weights.evidence +
      input.materiality * weights.materiality +
      input.timingUrgency * weights.timing +
      attribution * weights.attribution;
  } else {
    weights = { evidence: 0.25, materiality: 0.3, timing: 0.2, attribution: 0.1, reaction: 0.15 };
    priority = input.evidenceConfidence * weights.evidence +
      input.materiality * weights.materiality +
      input.timingUrgency * weights.timing +
      attribution * weights.attribution +
      reaction * weights.reaction;
  }
  if (input.verification === "INVALIDATED" || input.lifecycle === "invalidated") priority = 0;
  const rounded = clamp(priority);
  const state = deriveState(input, rounded);
  return {
    priority: rounded,
    state,
    components: {
      evidence_confidence: input.evidenceConfidence,
      materiality: input.materiality,
      timing_urgency: input.timingUrgency,
      attribution: attribution,
      reaction_score: reaction,
      weights,
      priority: rounded,
      catalyst_state: state,
    },
  };
}

function deriveState(input: ScoreInput, priority: number): CatalystState {
  if (input.verification === "INVALIDATED" || input.lifecycle === "invalidated" || input.lifecycle === "resolved") {
    return "INFORMATIONAL";
  }
  if (input.materiality < 40 && priority < 50) return "INFORMATIONAL";
  if (input.lifecycle === "scheduled" || input.lifecycle === "approaching" || input.lifecycle === "discovered") {
    if (input.materiality >= 60 && input.evidenceConfidence >= 70) return "UPCOMING";
    return "WATCH";
  }
  if (input.lifecycle === "announced" || input.lifecycle === "live" || input.lifecycle === "reacting") {
    if (input.timingUrgency < 45) {
      return input.materiality < 40 ? "INFORMATIONAL" : "WATCH";
    }
    if (input.materiality >= 60 && input.evidenceConfidence >= 55 && input.timingUrgency >= 70) {
      return "IMMEDIATE";
    }
    if (input.evidenceConfidence >= 40) return "DEVELOPING";
  }
  return "WATCH";
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
