import { JournalLegacyRedirect } from "@/journal";

/** Legacy public /journal application — retired in favor of the authenticated Journal. */
export default function JournalPage() {
  return <JournalLegacyRedirect />;
}
