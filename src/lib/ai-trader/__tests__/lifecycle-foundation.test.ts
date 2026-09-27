import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_TRADER_SESSION_STATUSES,
  AI_TRADER_SESSION_TRANSITIONS,
  canTransitionSessionStatus,
  isTerminalSessionStatus,
  sessionIdentityIsFrozen,
  sessionPatchIsLegal,
  type AiTraderSession,
} from "@/lib/ai-trader/domain/sessions";
import { EPISODE_TYPES } from "@/lib/ai-trader/domain/memory";
import { canCloseModelAssignmentActiveUntil } from "@/lib/ai-trader/domain/models";
import {
  strategyVersionIdentityChanged,
  type AiTraderStrategyVersion,
} from "@/lib/ai-trader/domain/strategies";
import { parseNullableNumeric } from "@/lib/ai-trader/persistence/row-mappers";
import * as strategyCandidates from "@/lib/ai-trader/persistence/strategy-candidates";
import {
  AI_TRADER_MUTABILITY_MATRIX,
  AI_TRADER_SCHEMA_APPLY_MIGRATION,
} from "@/lib/ai-trader/schema/schema-spec";
import { AI_TRADER_CURRENT_OPERATING_MODE, AI_TRADER_OFF_COPY } from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql"),
  "utf8",
);

const session: AiTraderSession = {
  sessionId: "ses_1",
  accountId: "acct_1",
  sessionDate: "2026-09-27",
  operatingMode: "OFF",
  strategyVersion: null,
  modelAssignmentVersion: null,
  riskConfigurationId: null,
  startingEquity: 100000,
  startedAt: null,
  endedAt: null,
  status: "CREATED",
};

const strategyVersion: AiTraderStrategyVersion = {
  strategyId: "strat_1",
  version: "v1",
  status: "PROPOSED",
  parentVersion: null,
  configurationHash: "abc",
  createdAt: "2026-09-27T00:00:00.000Z",
  approvedAt: null,
  approvedBy: null,
  backtestEvaluationId: null,
  shadowEvaluationId: null,
  paperEvaluationId: null,
  allowedModes: ["SHADOW"],
};

describe("AI Trader schema lifecycle", () => {
  it("uses CREATED/ACTIVE/PAUSED/KILLED/CLOSED/FAILED session statuses", () => {
    expect([...AI_TRADER_SESSION_STATUSES]).toEqual([
      "CREATED",
      "ACTIVE",
      "PAUSED",
      "KILLED",
      "CLOSED",
      "FAILED",
    ]);
    expect(sql).toContain("'CREATED', 'ACTIVE', 'PAUSED', 'KILLED', 'CLOSED', 'FAILED'");
    expect(sql).not.toMatch(/status IN \('OPEN', 'CLOSED', 'ABORTED'\)/);
  });

  it("allows only the documented session transitions", () => {
    expect(canTransitionSessionStatus("CREATED", "ACTIVE")).toBe(true);
    expect(canTransitionSessionStatus("CREATED", "FAILED")).toBe(true);
    expect(canTransitionSessionStatus("CREATED", "CLOSED")).toBe(false);
    expect(canTransitionSessionStatus("ACTIVE", "PAUSED")).toBe(true);
    expect(canTransitionSessionStatus("ACTIVE", "KILLED")).toBe(true);
    expect(canTransitionSessionStatus("ACTIVE", "CLOSED")).toBe(true);
    expect(canTransitionSessionStatus("ACTIVE", "FAILED")).toBe(true);
    expect(canTransitionSessionStatus("PAUSED", "ACTIVE")).toBe(true);
    expect(canTransitionSessionStatus("PAUSED", "CLOSED")).toBe(true);
    expect(sessionPatchIsLegal(session, { status: "ACTIVE", startedAt: "2026-09-27T13:30:00.000Z" })).toBe(true);
    expect(AI_TRADER_SESSION_TRANSITIONS.KILLED).toEqual([]);
  });

  it("prevents terminal sessions from reopening", () => {
    for (const status of ["KILLED", "CLOSED", "FAILED"] as const) {
      expect(isTerminalSessionStatus(status)).toBe(true);
      expect(canTransitionSessionStatus(status, "ACTIVE")).toBe(false);
      expect(canTransitionSessionStatus(status, "CREATED")).toBe(false);
      expect(
        sessionPatchIsLegal({ ...session, status }, { status: "ACTIVE" }),
      ).toBe(false);
    }
  });

  it("freezes session identity after leaving CREATED", () => {
    expect(sessionIdentityIsFrozen("CREATED")).toBe(false);
    expect(sessionIdentityIsFrozen("ACTIVE")).toBe(true);
    expect(sessionPatchIsLegal(session, { startingEquity: 90000 })).toBe(true);
    expect(
      sessionPatchIsLegal({ ...session, status: "ACTIVE" }, { startingEquity: 90000 }),
    ).toBe(false);
    expect(
      sessionPatchIsLegal({ ...session, status: "ACTIVE" }, { status: "PAUSED" }),
    ).toBe(true);
    expect(sql).toContain("ai_trader_session_lifecycle_guard");
    expect(sql).toContain("session identity is frozen after leaving CREATED");
  });

  it("uses distinct episode types instead of generic WATCHLIST", () => {
    expect([...EPISODE_TYPES]).toEqual([
      "TRADE",
      "PASS",
      "WAIT",
      "RISK_REJECTION",
      "WATCHLIST_PROMOTION",
      "WATCHLIST_REMOVAL",
      "MISSED_OPPORTUNITY",
      "EXECUTION_EVENT",
      "MARKET_REFERENCE",
    ]);
    expect(EPISODE_TYPES).not.toContain("WATCHLIST");
    expect(sql).toContain("WATCHLIST_PROMOTION");
    expect(sql).toContain("WATCHLIST_REMOVAL");
    expect(sql).toContain("MISSED_OPPORTUNITY");
    expect(sql).toContain("EXECUTION_EVENT");
    expect(sql).not.toMatch(/'WATCHLIST'/);
  });

  it("keeps evidence tables strict append-only", () => {
    const appendOnly = AI_TRADER_MUTABILITY_MATRIX.filter((row) => row.mutability === "strict-append-only");
    expect(appendOnly.map((row) => row.table)).toEqual([
      "ai_trader_context_snapshots",
      "ai_trader_observations",
      "ai_trader_episodes",
      "ai_trader_decision_evidence",
      "ai_trader_reflections",
      "ai_trader_counterfactuals",
      "ai_trader_reward_assessments",
      "ai_trader_audit_events",
      "ai_trader_watchlist_transitions",
    ]);
    expect(appendOnly.every((row) => row.allowedUpdateFields.length === 0 && row.deleteAllowed === false)).toBe(true);
    expect(sql).toContain("'ai_trader_context_snapshots'");
    expect(sql).not.toMatch(/FOREACH t IN ARRAY ARRAY\[\s*'ai_trader_sessions'/);
  });

  it("closes model assignment active_until once only", () => {
    expect(canCloseModelAssignmentActiveUntil(null, "2026-09-27T20:00:00.000Z")).toBe(true);
    expect(canCloseModelAssignmentActiveUntil("2026-09-27T20:00:00.000Z", "2026-09-28T20:00:00.000Z")).toBe(false);
    expect(canCloseModelAssignmentActiveUntil("2026-09-27T20:00:00.000Z", null)).toBe(false);
    expect(sql).toContain("active_until may close once from NULL to a timestamp");
    expect(sql).toContain("model assignment identity is immutable");
  });

  it("keeps strategy version identity immutable", () => {
    expect(strategyVersionIdentityChanged(strategyVersion, { ...strategyVersion, status: "SHADOW" })).toBe(false);
    expect(
      strategyVersionIdentityChanged(strategyVersion, { ...strategyVersion, configurationHash: "other" }),
    ).toBe(true);
    expect(sql).toContain("strategy version identity is immutable");
  });

  it("exposes only PROPOSED candidate inserts and no promotion API", () => {
    expect(strategyCandidates.insertProposedStrategyCandidate).toBeTypeOf("function");
    expect(strategyCandidates).not.toHaveProperty("setStatus");
    expect(strategyCandidates).not.toHaveProperty("promote");
    expect(strategyCandidates).not.toHaveProperty("approve");
    expect(strategyCandidates).not.toHaveProperty("approveControlledLive");
    expect(strategyCandidates).not.toHaveProperty("approveLive");
    expect(Object.keys(strategyCandidates)).toEqual(["insertProposedStrategyCandidate"]);
  });

  it("keeps profile replacement atomic and service-scoped", () => {
    expect(sql).toContain("ai_trader_replace_symbol_profile_v1");
    expect(sql).toContain("SET search_path TO public");
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toContain("UPDATE public.ai_trader_symbol_profiles SET is_current = false");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ai_trader_replace_symbol_profile_v1(jsonb) TO service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.ai_trader_replace_symbol_profile_v1(jsonb) FROM PUBLIC, anon, authenticated");
  });

  it("parses numeric mapper values without integer coercion", () => {
    expect(parseNullableNumeric(null)).toBeNull();
    expect(parseNullableNumeric("")).toBeNull();
    expect(parseNullableNumeric("12.750000")).toBe(12.75);
    expect(parseNullableNumeric(12.75)).toBe(12.75);
    expect(() => parseNullableNumeric(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => parseNullableNumeric("not-a-number")).toThrow(/invalid numeric string/);
    expect(() => parseNullableNumeric({ amount: 1 })).toThrow(/must be a number/);
  });

  it("does not apply the migration and keeps the OFF shell unchanged", () => {
    expect(AI_TRADER_SCHEMA_APPLY_MIGRATION).toBe(false);
    expect(AI_TRADER_CURRENT_OPERATING_MODE).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).toBe(AI_TRADER_OFF_COPY);
    expect(AI_TRADER_SHELL_SNAPSHOT.watchlist).toEqual([]);
    expect(AI_TRADER_SHELL_SNAPSHOT.positions).toEqual([]);
    expect(AI_TRADER_SHELL_SNAPSHOT.trades).toEqual([]);
    expect(AI_TRADER_SHELL_SNAPSHOT.pnl).toBeNull();
  });
});
