/**
 * Adapter boundary for future callers.
 *
 * Current Radar and screener paths keep using symbol. They do not import this module.
 * A later system can pass a symbol observation and receive a security id.
 */

import type { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { IdentityResolution, SecurityIdentityObservation, SymbolAtDate } from "@/types/security-identity";

export function resolveSecurityId(
  store: SecurityIdentityStore,
  observation: SecurityIdentityObservation,
): IdentityResolution {
  return store.resolve(observation);
}

export function securitySymbolAt(
  store: SecurityIdentityStore,
  securityId: string,
  eventDate: string,
): SymbolAtDate | null {
  return store.symbolAt(securityId, eventDate);
}

export function currentSecuritySymbol(
  store: SecurityIdentityStore,
  securityId: string,
): SymbolAtDate | null {
  return store.currentSymbol(securityId);
}
