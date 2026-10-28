import { HonestState } from "./HonestState";
import { useJournalT } from "../i18n";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

/** Shown when a background refresh failed but same-user Journal data is still displayed. */
export function JournalStaleBanner() {
  const t = useJournalT();
  const { loadState, staleError, refresh } = useJournalWorkspace();
  if (loadState !== "stale" || !staleError) return null;
  return (
    <HonestState
      kind="stale"
      title={t("state.journalRefreshFailed")}
      body={`${staleError} ${t("state.journalRetainedHint")}`}
      onRetry={() => void refresh()}
    />
  );
}
