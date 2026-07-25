// Shared Catalyst types on the client. Mirrors the closed set in
// supabase/functions/_shared/catalyst/contract.ts.

export type CatalystEventType =
  | "earnings"
  | "fda_biotech"
  | "merger_acquisition"
  | "analyst_action"
  | "sec_filing_news"
  | "corporate_action"
  | "product_contract"
  | "company_news";

export type CatalystVerificationState = "provider_reported";

export type CatalystTimeOfDay =
  | "before_open"
  | "after_close"
  | "during"
  | "unknown";

export interface CatalystEvent {
  id: string;
  dedupe_key: string;
  symbol: string;
  company_name: string | null;
  event_type: CatalystEventType;
  verification_state: CatalystVerificationState;
  event_date: string;
  event_time: string | null;
  time_of_day: CatalystTimeOfDay | null;
  title: string;
  description: string | null;
  source_name: string;
  source_url: string | null;
  provider: string;
  related_symbols: string[];
  facts: Record<string, unknown>;
  published_at: string | null;
}

export interface CatalystUserStateRow {
  id: string;
  event_id: string;
  saved_at: string | null;
  reviewed_at: string | null;
}
