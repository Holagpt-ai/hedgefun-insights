import type { DataProvenanceState } from "@/config/data-quality.config";
import type {
  AdrStatus,
  IdentityResolutionStatus,
  ReferenceIdentifierKind,
  SecurityIdentityVersion,
  SecurityResolutionState,
  SecurityType,
} from "@/config/security-identity.config";

export type SecurityId = string;

export interface Security {
  securityId: SecurityId;
  currentSymbol: string;
  issuerName: string | null;
  securityType: SecurityType;
  exchange: string | null;
  country: string | null;
  adrStatus: AdrStatus;
  active: boolean;
  resolutionState: SecurityResolutionState;
  createdAt: string;
  updatedAt: string;
}

export interface SecuritySymbolHistory {
  securityId: SecurityId;
  symbol: string;
  exchange: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
  sourceAsOf: string | null;
  provenance: DataProvenanceState;
  observedAt: string | null;
  fetchedAt: string | null;
}

export interface SecurityReferenceIdentifier {
  securityId: SecurityId;
  kind: ReferenceIdentifierKind;
  value: string;
  source: string | null;
  sourceAsOf: string | null;
  provenance: DataProvenanceState;
  observedAt: string | null;
  fetchedAt: string | null;
}

/**
 * One provider or reference observation. Permanent identifiers are optional.
 * Absent identifiers stay absent. Issuer name is never an identity key.
 */
export interface SecurityIdentityObservation {
  symbol: string;
  exchange?: string | null;
  effectiveDate: string;
  issuerName?: string | null;
  securityType?: SecurityType | null;
  country?: string | null;
  adrStatus?: AdrStatus | null;
  providerReferenceId?: string | null;
  cik?: string | null;
  figi?: string | null;
  compositeFigi?: string | null;
  source?: string | null;
  sourceAsOf?: string | null;
  observedAt?: string | null;
  fetchedAt?: string | null;
  provenance?: DataProvenanceState | null;
  /** Explicit write clock for createdAt/updatedAt. Identity does not read the system clock. */
  recordedAt: string;
}

export interface SymbolAtDate {
  securityId: SecurityId;
  symbol: string;
  exchange: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface IdentityResolution {
  version: SecurityIdentityVersion;
  status: IdentityResolutionStatus;
  securityId: SecurityId | null;
  security: Security | null;
  created: boolean;
  reason: string;
}
