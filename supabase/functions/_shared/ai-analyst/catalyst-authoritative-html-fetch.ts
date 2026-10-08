import { GENERIC_USER_AGENT } from "../catalyst-intelligence/config.ts";
import { safeFetch } from "../catalyst-intelligence/source-fetch.ts";
import { AUTHORITATIVE_ENRICH_MAX_BYTES } from "./catalyst-authoritative-enrich.ts";

export async function fetchAuthoritativeHtml(url: string): Promise<string | null> {
  try {
    const result = await safeFetch({
      url,
      userAgent: `${GENERIC_USER_AGENT} AnalystCatalystEnrich/2.0`,
      timeoutMs: 8_000,
      maxBytes: AUTHORITATIVE_ENRICH_MAX_BYTES,
    });
    if (result.unchanged || result.status >= 400) return null;
    return result.body;
  } catch (err) {
    console.error("[catalyst-authoritative-fetch]", url, err);
    return null;
  }
}
