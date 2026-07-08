/**
 * Provider-agnostic entitlement helpers.
 *
 * Frontend gating ONLY. Do not couple to any payment provider
 * (Stripe / Paddle / Lemon Squeezy / Polar / Creem / manual admin grants).
 *
 * All Pro-gated UI in the app should route access checks through here so
 * a new plan (e.g. "team", "lifetime", "promo") can be added in one place.
 */

/** Plans that grant Pro-level access to gated features. */
export const PRO_ACCESS_PLANS = ["pro", "unlimited", "admin"] as const;

/** Plans that are considered paid (excludes internal/admin grants). */
export const PAID_PLANS = ["pro", "unlimited"] as const;

export type ProAccessPlan = (typeof PRO_ACCESS_PLANS)[number];
export type PaidPlan = (typeof PAID_PLANS)[number];

function normalize(plan?: string | null): string {
  return (plan ?? "").trim().toLowerCase();
}

/** True if the plan is a paid customer plan (excludes admin/internal). */
export function isPaidPlan(plan?: string | null): boolean {
  const p = normalize(plan);
  return (PAID_PLANS as readonly string[]).includes(p);
}

/** True if the plan grants Pro-level feature access (paid OR internal admin). */
export function hasProAccess(plan?: string | null): boolean {
  const p = normalize(plan);
  return (PRO_ACCESS_PLANS as readonly string[]).includes(p);
}

/** True if the plan is an internal/admin grant rather than a paid subscription. */
export function isInternalPlan(plan?: string | null): boolean {
  return normalize(plan) === "admin";
}
