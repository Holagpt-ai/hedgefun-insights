import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";

export interface WebSearchHit {
  title: string;
  url: string;
  snippet?: string | null;
  publishedAt?: string | null;
}

export interface FreshCatalystDiscoveryMeta {
  attempted: boolean;
  succeeded: boolean;
  searchQueries: string[];
  source: "brave_web_search" | null;
  error: string | null;
}

export type AnalystCatalystRowWithProvenance = AnalystCatalystRow & {
  sourceUrl?: string | null;
  officialSource?: boolean;
  evidenceOrigin?: "stocksist_catalyst" | "fresh_web_search";
};
