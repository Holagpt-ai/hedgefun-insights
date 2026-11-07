/**
 * Operations Control Center V1 — status vocabulary and roll-up (Batch 212).
 *
 * Read-only. Unknown or missing evidence never rolls up to "healthy".
 */

export type OpsStatus =
  | "healthy"
  | "degraded"
  | "failing"
  | "unknown"
  | "stale_telemetry"
  | "not_configured"
  | "not_applicable";

export const OPS_STATUS_LABEL: Record<OpsStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  failing: "Failing",
  unknown: "Unknown",
  stale_telemetry: "Stale telemetry",
  not_configured: "Not configured",
  not_applicable: "Not applicable",
};

/** Higher = worse for the user. not_applicable / not_configured never mask a problem. */
const SEVERITY: Record<OpsStatus, number> = {
  failing: 6,
  degraded: 5,
  stale_telemetry: 4,
  unknown: 3,
  not_configured: 2,
  healthy: 1,
  not_applicable: 0,
};

export function opsSeverity(status: OpsStatus): number {
  return SEVERITY[status];
}

export function worstStatus(statuses: OpsStatus[]): OpsStatus {
  if (statuses.length === 0) return "unknown";
  return statuses.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst));
}

/** Where a metric came from. `href` only for public, non-secret references. */
export interface EvidenceSource {
  label: string;
  detail?: string;
  href?: string;
}

export interface OpsComponentSummary {
  id: string;
  title: string;
  status: OpsStatus;
  /** One-line plain explanation of why the status was chosen. */
  explanation: string;
  /** ISO timestamp of the newest underlying observation, or null when none. */
  lastObservedAt: string | null;
  source: EvidenceSource;
  /** True when the component reflects user-facing data (scanner, feed). */
  userImpact: boolean;
}

export interface OverallHealth {
  status: OpsStatus;
  headline: string;
  drivers: OpsComponentSummary[];
}

/**
 * Overall health is driven by user-impact components first.
 *
 * - Any user-impact component failing/degraded → overall takes that status,
 *   regardless of other services reporting success.
 * - A user-impact component that is unknown / stale telemetry prevents a
 *   healthy roll-up.
 * - Non-user-impact components (provenance, source sync) are reported as
 *   drivers when worse than healthy, but only lower overall when no
 *   user-impact component is already worse.
 */
export function computeOverallHealth(components: OpsComponentSummary[]): OverallHealth {
  const impact = components.filter((c) => c.userImpact);
  const support = components.filter((c) => !c.userImpact);

  if (impact.length === 0) {
    return {
      status: "unknown",
      headline: "No user-impact evidence available",
      drivers: [],
    };
  }

  const impactStatus = worstStatus(impact.map((c) => c.status));
  const impactDrivers = impact
    .filter((c) => opsSeverity(c.status) === opsSeverity(impactStatus))
    .filter((c) => c.status !== "healthy" && c.status !== "not_applicable");

  if (impactStatus === "failing" || impactStatus === "degraded") {
    return {
      status: impactStatus,
      headline: `${impactDrivers.map((d) => d.title).join(", ")} ${impactStatus === "failing" ? "failing" : "degraded"}`,
      drivers: impactDrivers,
    };
  }

  if (impactStatus === "unknown" || impactStatus === "stale_telemetry" || impactStatus === "not_configured") {
    return {
      status: impactStatus === "not_configured" ? "unknown" : impactStatus,
      headline: `Cannot confirm ${impactDrivers.map((d) => d.title).join(", ")}`,
      drivers: impactDrivers,
    };
  }

  // impact is healthy or not_applicable from here on.
  const supportProblems = support.filter((c) => opsSeverity(c.status) >= opsSeverity("degraded"));
  if (supportProblems.length > 0) {
    return {
      status: "degraded",
      headline: `User-facing data ${impactStatus === "healthy" ? "healthy" : "inactive"}; ${supportProblems.map((d) => d.title).join(", ")} need attention`,
      drivers: supportProblems,
    };
  }

  if (impactStatus === "not_applicable") {
    return {
      status: "not_applicable",
      headline: "Market session inactive — no live publication expected",
      drivers: [],
    };
  }

  return {
    status: "healthy",
    headline: "User-facing scanner and feed evidence is current",
    drivers: [],
  };
}
