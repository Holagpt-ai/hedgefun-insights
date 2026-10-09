import { GENERIC_USER_AGENT } from "../catalyst-intelligence/config.ts";
import { SourceFetchError, safeFetch } from "../catalyst-intelligence/source-fetch.ts";
import {
  AUTHORITATIVE_ENRICH_MAX_BYTES,
  type AuthoritativeFetchResult,
} from "./catalyst-authoritative-enrich.ts";

export async function fetchAuthoritativeContent(url: string): Promise<AuthoritativeFetchResult> {
  try {
    const result = await safeFetch({
      url,
      userAgent: `${GENERIC_USER_AGENT} AnalystCatalystEnrich/2.1`,
      timeoutMs: 8_000,
      maxBytes: AUTHORITATIVE_ENRICH_MAX_BYTES,
    });
    if (result.unchanged) {
      return { httpStatus: 304, contentType: "text/html", body: "" };
    }
    return { httpStatus: result.status, contentType: "text/html", body: result.body };
  } catch (err) {
    if (err instanceof SourceFetchError) {
      return {
        httpStatus: err.statusCode,
        contentType: null,
        body: "",
      };
    }
    console.error("[catalyst-authoritative-fetch]", url, err);
    return { httpStatus: null, contentType: null, body: "" };
  }
}

/** @deprecated use fetchAuthoritativeContent for status-aware recovery */
export async function fetchAuthoritativeHtml(url: string): Promise<string | null> {
  const result = await fetchAuthoritativeContent(url);
  if (result.httpStatus != null && result.httpStatus >= 400) return null;
  if (!result.body.trim()) return null;
  return result.body;
}
