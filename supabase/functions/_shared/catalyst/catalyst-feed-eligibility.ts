/**
 * Central rule: only provider_reported catalyst_events are eligible for ticker feeds.
 * attribution_invalidated (Gate H remediation) and other states are excluded.
 */

export const CATALYST_FEED_VERIFICATION_STATE = "provider_reported" as const;

export type CatalystFeedVerificationState = typeof CATALYST_FEED_VERIFICATION_STATE
  | "attribution_invalidated";

export function isEligibleCatalystFeedRow(
  verificationState: string | null | undefined,
): boolean {
  return verificationState === CATALYST_FEED_VERIFICATION_STATE;
}

export function isSecEdgarCatalystRow(provider: string | null | undefined): boolean {
  return provider === "sec_edgar";
}
