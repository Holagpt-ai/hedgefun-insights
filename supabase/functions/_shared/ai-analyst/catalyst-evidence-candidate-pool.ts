/** Deno mirror of src/lib/ai-analyst/catalyst-evidence-candidate-pool.ts */

import {
  scoreCatalystRow,
  sortScoredCandidates,
  type CatalystRow,
} from "./catalyst-selection.ts";

export const DEFAULT_CATALYST_EVIDENCE_POOL_LIMIT = 12;

function dedupeKey(row: CatalystRow): string {
  return `${row.sourceUrl ?? ""}|${row.title ?? ""}`.toLowerCase();
}

function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function limitScoredCatalystCandidates(
  rows: readonly CatalystRow[],
  limit = DEFAULT_CATALYST_EVIDENCE_POOL_LIMIT,
): { rows: CatalystRow[]; totalEligible: number } {
  const seen = new Set<string>();
  const deduped: CatalystRow[] = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  const scored = deduped.map(scoreCatalystRow).sort(sortScoredCandidates);
  const totalEligible = scored.length;
  if (scored.length <= limit) {
    return { rows: scored.map((s) => s.row), totalEligible };
  }

  const picked: ReturnType<typeof scoreCatalystRow>[] = [];
  const pickedKeys = new Set<string>();
  const tryPick = (s: ReturnType<typeof scoreCatalystRow>) => {
    const key = dedupeKey(s.row);
    if (pickedKeys.has(key)) return;
    picked.push(s);
    pickedKeys.add(key);
  };

  for (const s of scored) {
    if (picked.length >= limit) break;
    tryPick(s);
  }

  const officialSearch = scored.filter(
    (s) => s.row.officialSource && s.row.evidenceOrigin === "fresh_web_search",
  );
  for (const s of officialSearch.slice(0, 2)) {
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

  return { rows: [...picked].sort(sortScoredCandidates).map((s) => s.row), totalEligible };
}
