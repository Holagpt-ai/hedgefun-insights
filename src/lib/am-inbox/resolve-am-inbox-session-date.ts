import { easternDate } from "@/lib/radar-v22";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Target AM session date for late-session handoff RPC.
 * Prefers validated workspace `et_date`; falls back to client Eastern calendar date
 * so the handoff query can start before the workspace payload arrives.
 */
export function resolveAmInboxSessionDate(
  workspaceEtDate: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const trimmed = (workspaceEtDate ?? "").trim();
  if (ISO_DATE.test(trimmed)) return trimmed;
  return easternDate(nowMs);
}
