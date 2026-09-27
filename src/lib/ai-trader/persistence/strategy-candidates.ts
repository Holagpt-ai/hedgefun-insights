import { proposedCandidateDraft } from "@/lib/ai-trader/research/strategy-research";
import type { SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { isUndefinedTableError, MemoryPersistenceError } from "@/lib/ai-trader/persistence/executor";

export interface ProposedCandidateWrite {
  id: string;
  status: "PROPOSED";
}

export async function insertProposedStrategyCandidate(
  executor: SqlExecutor,
  hypothesis: string,
  sourceReflectionIds: readonly string[],
  createdAt: string,
): Promise<ProposedCandidateWrite> {
  const draft = proposedCandidateDraft(hypothesis, sourceReflectionIds, createdAt);
  if (draft.status !== "PROPOSED") {
    throw new MemoryPersistenceError("NOT_SUPPORTED_YET", "AI may only persist PROPOSED candidates.");
  }
  try {
    const rows = await executor.query(
      `INSERT INTO public.ai_trader_strategy_candidates (
        parent_strategy_version_id, candidate_version, hypothesis, source_reflection_ids, status
      ) VALUES ($1,$2,$3,$4,$5) RETURNING id, status`,
      [null, draft.candidateVersion, draft.hypothesis, draft.sourceReflectionIds, "PROPOSED"],
    );
    return { id: String(rows[0]?.id ?? ""), status: "PROPOSED" };
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new MemoryPersistenceError("TABLES_NOT_APPLIED", "Strategy candidate table is not applied.");
    }
    throw error;
  }
}
