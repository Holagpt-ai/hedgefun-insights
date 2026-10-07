/** Detects why-is-it-moving / catalyst-first analyst questions. */
export function isMovementCatalystQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;

  const asksWhy =
    /\bwhy\s+(?:is|are|was|were|did|has|have)\b/i.test(t) ||
    /\bwhat(?:'s| is)\s+(?:the\s+)?catalyst\b/i.test(t) ||
    /\bwhat\s+(?:is|are)\s+.+\s+moving\b/i.test(t);

  const movementContext =
    /\b(?:up|down|moving|rally|rallying|drop(?:ped|ping)?|fall(?:ing|en)?|sell(?:ing|-)?\s+off|jump(?:ed|ing)?|soar(?:ed|ing)?|surge(?:d|ing)?)\b/i
      .test(t) ||
    /\b(?:today|this morning|premarket|pre-market|after hours|after-hours)\b/i.test(t);

  return asksWhy && movementContext;
}
