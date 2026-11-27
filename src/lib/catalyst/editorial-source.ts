/** Opinion / commentary publishers — never treated as verified corporate event sources. */
export const OPINION_EDITORIAL_SOURCE =
  /\b(?:motley\s*fool|seeking\s*alpha|zacks|the\s*street|investor'?s?\s*business\s*daily)\b/i;

/** Financial news (factual reporting) — News label, not Press Release; may still carry corporate event types when direct. */
export const FINANCIAL_NEWS_SOURCE =
  /\b(?:reuters|bloomberg|cnbc|barron'?s|wall\s*street\s*journal|marketwatch|benzinga|finance\.yahoo|yahoo\s*finance)\b/i;

export const EDITORIAL_NEWS_SOURCE = new RegExp(
  `${OPINION_EDITORIAL_SOURCE.source}|${FINANCIAL_NEWS_SOURCE.source}`,
  "i",
);

export function isOpinionEditorialPublisher(source: string | null | undefined): boolean {
  if (!source?.trim()) return false;
  return OPINION_EDITORIAL_SOURCE.test(source);
}

export function isEditorialNewsPublisher(source: string | null | undefined): boolean {
  if (!source?.trim()) return false;
  return EDITORIAL_NEWS_SOURCE.test(source);
}

export function isEditorialNewsTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  const t = title.trim();
  return /^(the\s+)?motley\s+fool\b/i.test(t)
    || /\bthe\s+motley\s+fool\s*:/i.test(t)
    || /\|\s*the\s+motley\s+fool\b/i.test(t);
}

export function isEditorialCatalystArticle(input: {
  source_name?: string | null;
  title?: string | null;
}): boolean {
  return isOpinionEditorialPublisher(input.source_name) || isEditorialNewsTitle(input.title);
}