import type { RadarV2LoadDiagnostic } from "@/lib/screeners/radar-v2-diagnostics";

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export interface RadarDebugPanelProps {
  diagnostic: RadarV2LoadDiagnostic | null;
  syncedAt?: string | null;
}

/**
 * Compact, opt-in Radar V2 consumer diagnostic. Renders bookkeeping only —
 * never rows, symbols, auth, tokens, or credentials.
 */
export function RadarDebugPanel({ diagnostic, syncedAt }: RadarDebugPanelProps) {
  return (
    <aside
      data-testid="radar-debug"
      className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground space-y-0.5"
    >
      <div className="font-semibold uppercase tracking-wide text-foreground">RADAR DEBUG</div>
      <div>source: {display(diagnostic?.source)}</div>
      <div>reason: {display(diagnostic?.reason)}</div>
      <div>session: {display(diagnostic?.session)}</div>
      <div>attempts: {display(diagnostic?.attempts)}</div>
      <div>generation: {display(diagnostic?.generationId)}</div>
      <div>declared: {display(diagnostic?.declaredCandidateCount)}</div>
      <div>lastAttempt: {display(diagnostic?.lastAttemptReason)}</div>
      {syncedAt ? <div>synced: {syncedAt}</div> : null}
    </aside>
  );
}
