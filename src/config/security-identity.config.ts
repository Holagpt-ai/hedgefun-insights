/**
 * Security Identity V1.
 *
 * Canonical identity is an internal security id. Symbol is an attribute that
 * changes over time. This contract does not score, rank, or backfill history.
 */

import type { DataProvenanceState } from "@/config/data-quality.config";

export const SECURITY_IDENTITY_VERSION = "v1" as const;
export type SecurityIdentityVersion = typeof SECURITY_IDENTITY_VERSION;

export const SECURITY_TYPES = [
  "COMMON_STOCK",
  "ADR",
  "ETF",
  "PREFERRED",
  "WARRANT",
  "UNKNOWN",
] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];

export const ADR_STATUSES = ["ADR", "NOT_ADR", "UNKNOWN"] as const;
export type AdrStatus = (typeof ADR_STATUSES)[number];

/** Stored identity confidence. Candidate means the security exists but is not confirmed by a security-level identifier. */
export const SECURITY_RESOLUTION_STATES = ["RESOLVED", "CANDIDATE"] as const;
export type SecurityResolutionState = (typeof SECURITY_RESOLUTION_STATES)[number];

export const IDENTITY_RESOLUTION_STATUSES = ["RESOLVED", "CANDIDATE", "UNRESOLVED"] as const;
export type IdentityResolutionStatus = (typeof IDENTITY_RESOLUTION_STATUSES)[number];

/**
 * Identifier kinds the resolver will accept when an observation supplies them.
 * CIK identifies an issuer, not a security, and never merges two securities by itself.
 * FIGI, composite FIGI, and a provider reference id are security-level when present.
 */
export const REFERENCE_IDENTIFIER_KINDS = [
  "COMPOSITE_FIGI",
  "FIGI",
  "PROVIDER_REFERENCE",
  "CIK",
] as const;
export type ReferenceIdentifierKind = (typeof REFERENCE_IDENTIFIER_KINDS)[number];

export const SECURITY_LEVEL_IDENTIFIER_PRIORITY = [
  "COMPOSITE_FIGI",
  "FIGI",
  "PROVIDER_REFERENCE",
] as const satisfies readonly ReferenceIdentifierKind[];

export type SecurityLevelIdentifierKind = (typeof SECURITY_LEVEL_IDENTIFIER_PRIORITY)[number];

export const SECURITY_IDENTITY_PROVENANCE: readonly DataProvenanceState[] = [
  "PROVIDER",
  "DERIVED",
  "INTERNAL",
  "COMPOSITE",
  "UNKNOWN",
];
