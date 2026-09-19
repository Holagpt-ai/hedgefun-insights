import type {
  DataFreshnessState,
  DataProvenanceState,
  DataQualityContractVersion,
  DataQualityDiagnosticCode,
  DataQualityMetricId,
  DataQualityMetricPolicy,
  DataQualityState,
} from "@/config/data-quality.config";

export type {
  DataFreshnessState,
  DataProvenanceState,
  DataQualityDiagnosticCode,
  DataQualityMetricId,
  DataQualityMetricPolicy,
  DataQualityState,
};

export interface DataQualityDiagnostic {
  code: DataQualityDiagnosticCode;
  field?: string;
  message: string;
}

export interface DataValueLineage {
  inputs: readonly string[];
}

export interface DataValue<T> {
  version: DataQualityContractVersion;
  value: T | null;
  qualityState: DataQualityState;
  freshnessState: DataFreshnessState;
  provenance: DataProvenanceState;
  source?: string | null;
  sourceAsOf?: string | null;
  observedAt?: string | null;
  fetchedAt?: string | null;
  computedAt?: string | null;
  usableForScoring: boolean;
  usableForFiltering: boolean;
  usableForDisplay: boolean;
  diagnostics: readonly DataQualityDiagnostic[];
  lineage?: DataValueLineage;
  metric?: DataQualityMetricId;
}

export interface DataValueCreateOptions {
  metric?: DataQualityMetricId;
  freshnessState?: DataFreshnessState;
  provenance?: DataProvenanceState;
  source?: string | null;
  sourceAsOf?: string | null;
  observedAt?: string | null;
  fetchedAt?: string | null;
  computedAt?: string | null;
  diagnostics?: readonly DataQualityDiagnostic[];
  lineage?: DataValueLineage;
  evaluatedAt?: string | number | null;
  policyOverride?: Partial<
    Pick<
      DataQualityMetricPolicy,
      | "staleDisplayAllowed"
      | "staleFilteringAllowed"
      | "staleScoringAllowed"
      | "agingScoringAllowed"
      | "agingFilteringAllowed"
    >
  >;
}
