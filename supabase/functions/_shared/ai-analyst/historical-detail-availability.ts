/**
 * historicalMemory is the authoritative same-security evidence payload.
 * A thin workflow handoff must not mark that evidence unavailable.
 */
export function applyLoadedHistoricalMemory(
  packet: Record<string, unknown>,
  memory: unknown,
): Record<string, unknown> {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) return packet;
  if ((memory as { contextLoaded?: unknown }).contextLoaded !== true) return packet;
  const unavailable = packet.unavailable;
  if (!unavailable || typeof unavailable !== "object" || Array.isArray(unavailable)) return packet;
  if ((unavailable as { historicalDetail?: unknown }).historicalDetail !== true) return packet;
  const evidence = packet.HISTORICAL_EVIDENCE;
  const evidenceObj = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : {};
  return {
    ...packet,
    unavailable: { ...(unavailable as Record<string, unknown>), historicalDetail: false },
    HISTORICAL_EVIDENCE: {
      ...evidenceObj,
      backendEvidenceRetained: true,
      handoffNote:
        "Workflow handoff omitted episode fields. Continuation rates, comparable episodes, forward outcomes, intraday reconstruction, linked events, sample size, and provenance are in historicalMemory.",
    },
  };
}
