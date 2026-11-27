/** Mirror of src/lib/catalyst/editorial-source.ts for Edge ingest. */
export const EDITORIAL_NEWS_SOURCE =
  /\b(?:motley\s*fool|seeking\s*alpha|benzinga|yahoo|reuters|bloomberg|cnbc|barron'?s|wall\s*street\s*journal|zacks|investor'?s?\s*business\s*daily|marketwatch|the\s*street)\b/i;

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
  return isEditorialNewsPublisher(input.source_name) || isEditorialNewsTitle(input.title);
}