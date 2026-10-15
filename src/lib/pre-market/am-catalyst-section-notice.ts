import type { SectionEnvelope } from "@/types/pre-market";

/** Honest Catalyst Watch labeling when ingestion/query is not fully available. */
export function amCatalystWatchNotice(
  section: Pick<SectionEnvelope<unknown>, "status" | "reason_code"> | null | undefined,
): string | null {
  if (!section) return null;
  if (section.status === "unavailable") {
    if (section.reason_code === "QUERY_FAILED") {
      return "Catalyst ingestion query failed — direct catalysts may be incomplete until refresh succeeds.";
    }
    return "Catalyst source unavailable — verified ticker catalysts may be missing.";
  }
  if (section.status === "stale") {
    return "Catalyst watch data is stale; timestamps reflect the last successful sync.";
  }
  return null;
}
