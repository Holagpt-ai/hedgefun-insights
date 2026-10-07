/** Detects why-is-it-moving / CURRENT_CATALYST analyst questions. */
export function isMovementCatalystQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;

  const asksCatalyst =
    /\bwhy\s+(?:is|are|was|were|did|has|have)\b/i.test(t) ||
    /\bwhat(?:'s| is)\s+(?:the\s+)?catalyst\b/i.test(t) ||
    /\bwhat\s+(?:is|are)\s+.+\s+moving\b/i.test(t) ||
    /\bwhat(?:'s| is)\s+moving\b/i.test(t) ||
    /\bwhat\s+happened\s+to\b/i.test(t) ||
    /\bwhy\s+did\b.+\b(?:spike|jump|surge|rally|drop|fall|selloff|sell-off)\b/i.test(t);

  const movementContext =
    /\b(?:up|down|moving|running|run(?:ning)?|rally|rallying|drop(?:ped|ping)?|fall(?:ing|en)?|sell(?:ing|-)?\s+off|jump(?:ed|ing)?|soar(?:ed|ing)?|surge(?:d|ing)?|spike(?:d|s)?)\b/i
      .test(t) ||
    /\b(?:today|this morning|premarket|pre-market|after hours|after-hours)\b/i.test(t);

  if (asksCatalyst && movementContext) return true;

  if (/\bwhat(?:'s| is)\s+(?:the\s+)?catalyst\s+for\b/i.test(t)) return true;
  if (/\bwhy\s+did\b.+\b(?:spike|jump|surge|rally)\b/i.test(t)) return true;

  return false;
}
