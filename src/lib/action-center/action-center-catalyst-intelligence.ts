import type { SymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import type { CatalystAvailability } from "@/lib/catalyst/intelligence-v2";

export type VolumeLeaderCatalystIntel = {
  availability: CatalystAvailability | "pending";
  title: string | null;
  kind: "upcoming" | "recent" | null;
  href: string | null;
  evidenceLine: string | null;
};

export function resolveVolumeLeaderCatalystIntel(input: {
  platform?: SymbolCatalystPlatformContext | null;
  pending?: boolean;
  error?: boolean;
}): VolumeLeaderCatalystIntel {
  if (input.error) {
    return {
      availability: "unavailable",
      title: null,
      kind: null,
      href: null,
      evidenceLine: "Catalyst intel unavailable",
    };
  }
  if (input.pending && !input.platform) {
    return {
      availability: "pending",
      title: null,
      kind: null,
      href: null,
      evidenceLine: null,
    };
  }
  const availability = input.platform?.availability ?? "none";
  if (availability !== "verified" || !input.platform?.enrichment) {
    return {
      availability,
      title: null,
      kind: null,
      href: input.platform?.catalystPath ?? null,
      evidenceLine: availability === "none" ? "No verified catalyst" : null,
    };
  }
  const entry = input.platform.enrichment;
  const evidenceLine = "Provider-reported catalyst (not a price cause claim)";
  return {
    availability: "verified",
    title: entry.event.title?.trim() || null,
    kind: entry.kind,
    href: input.platform.catalystPath,
    evidenceLine,
  };
}
