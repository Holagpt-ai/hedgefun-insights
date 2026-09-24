/** Shareholder / securities solicitation notices (classification + presentation). */

export const LEGAL_SHAREHOLDER_NOTICE_PATTERNS: readonly RegExp[] = [
  /\bclass[- ]actions?\b/i,
  /\bsecurities[- ](?:class[- ]action|fraud|litigation)\b/i,
  /\binvestors?\s+(?:who\s+(?:purchased|acquired)|losses?|loss\s+alert)\b/i,
  /\b(?:shareholders?|stockholders?)\s+(?:alert|lawsuit|class[- ]action|investigation)\b/i,
  /\blead\s+plaintiff\b/i,
  /\blaw\s+firm\b/i,
  /\bsecurities\s+law\b/i,
  /\b(?:remind(?:s|er)?|notifies)\s+investors?\b/i,
  /\binvestigation\s+(?:of|into)\b.{0,80}\b(?:securities|shareholders?|investors?)\b/i,
  /\bdeadline\b.{0,40}\b(?:investors?|shareholders?)\b/i,
  /\bphase\s*(?:ii|2|i{1,2}|1)\b.{0,40}\binvestigation\b/i,
];

export function looksLikeLegalShareholderNoticeText(
  title: string,
  description?: string | null,
  sourceName?: string | null,
): boolean {
  const blob = `${title} ${description ?? ""} ${sourceName ?? ""}`;
  return LEGAL_SHAREHOLDER_NOTICE_PATTERNS.some((p) => p.test(blob));
}
