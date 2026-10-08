import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";
import {
  scoreCatalystRow,
  sortScoredCandidates,
  type ScoredCatalystRow,
} from "@/lib/ai-analyst/catalyst-selection";
import { domainFromUrl } from "@/lib/ai-analyst/catalyst-pipeline-trace";

export const DEFAULT_CATALYST_EVIDENCE_POOL_LIMIT = 12;

function dedupeKey(row: AnalystCatalystRow): string {
  return `${row.sourceUrl ?? ""}|${row.title ?? ""}`.toLowerCase();
}

export function dedupeCatalystRows(rows: readonly AnalystCatalystRow[]): AnalystCatalystRow[] {
  const seen = new Set<string>();
  const out: AnalystCatalystRow[] = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Score all eligible candidates before limiting. Internal rows no longer consume fixed
 * slots ahead of stronger official search hits.
 */
export function limitScoredCatalystCandidates(
  rows: readonly AnalystCatalystRow[],
  limit = DEFAULT_CATALYST_EVIDENCE_POOL_LIMIT,
): { rows: AnalystCatalystRow[]; scored: ScoredCatalystRow[]; totalEligible: number } {
  const deduped = dedupeCatalystRows(rows);
  const scored = deduped.map(scoreCatalystRow).sort(sortScoredCandidates);
  const totalEligible = scored.length;

  if (scored.length <= limit) {
    return { rows: scored.map((s) => s.row), scored, totalEligible };
  }

  const picked: ScoredCatalystRow[] = [];
  const pickedKeys = new Set<string>();
  const domains = new Set<string>();

  const tryPick = (s: ScoredCatalystRow) => {
    const key = dedupeKey(s.row);
    if (pickedKeys.has(key)) return;
    picked.push(s);
    pickedKeys.add(key);
    const d = domainFromUrl(s.row.sourceUrl);
    if (d) domains.add(d);
  };

  for (const s of scored) {
    if (picked.length >= limit) break;
    tryPick(s);
  }

  // Reserve diversity: keep up to 2 high-scoring official search hits even if crowded.
  const officialSearch = scored.filter(
    (s) => s.row.officialSource && s.row.evidenceOrigin === "fresh_web_search",
  );
  for (const s of officialSearch.slice(0, 2)) {
    if (picked.length >= limit && pickedKeys.has(dedupeKey(s.row))) continue;
    if (pickedKeys.has(dedupeKey(s.row))) continue;
    if (picked.length < limit) {
      tryPick(s);
      continue;
    }
    const weakestIdx = picked.findIndex(
      (p) => !p.row.officialSource && p.selectionScore < s.selectionScore,
    );
    if (weakestIdx >= 0) {
      pickedKeys.delete(dedupeKey(picked[weakestIdx]!.row));
      picked[weakestIdx] = s;
      pickedKeys.add(dedupeKey(s.row));
    }
  }

  const ordered = [...picked].sort(sortScoredCandidates);
  return { rows: ordered.map((s) => s.row), scored: ordered, totalEligible };
}
