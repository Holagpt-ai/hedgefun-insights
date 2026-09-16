import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  assembleRadarNewsResponse,
  finnhubDateWindow,
  mapFinnhubCompanyNews,
  mapMassiveTickerNews,
  mergeRadarNewsArticles,
  shouldCacheRadarNews,
} from "./radar-news.ts";

const NOW = Date.parse("2026-09-16T20:00:00.000Z");
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

Deno.test("maps a fresh Finnhub article and converts datetime to ISO", () => {
  const mapped = mapFinnhubCompanyNews(
    [{
      headline: "Antelope Enterprise closes $6M convertible note offering",
      source: "GlobeNewswire",
      url: "https://example.com/aehl",
      datetime: NOW / 1000 - 9 * 3600,
    }],
    NOW,
    LOOKBACK_MS,
  );
  assertEquals(mapped.length, 1);
  assertEquals(mapped[0].provider, "finnhub");
  assertEquals(mapped[0].source, "GlobeNewswire");
  assertEquals(mapped[0].published_at, "2026-09-16T11:00:00.000Z");
});

Deno.test("stale Finnhub and Massive articles are excluded", () => {
  assertEquals(
    mapFinnhubCompanyNews(
      [{ headline: "Old AEHL", source: "Wire", datetime: Date.parse("2026-07-06T00:00:00.000Z") / 1000 }],
      NOW,
      LOOKBACK_MS,
    ).length,
    0,
  );
  assertEquals(
    mapMassiveTickerNews(
      [{ title: "Old GLOO", published_utc: "2026-04-15T00:00:00.000Z", article_url: "https://example.com/gloo" }],
      NOW,
      LOOKBACK_MS,
    ).length,
    0,
  );
});

Deno.test("24h cutoff keeps in-window Massive news and drops missing timestamps", () => {
  const mapped = mapMassiveTickerNews(
    [
      { title: "Fresh PR", published_utc: "2026-09-16T12:00:00.000Z", publisher: { name: "GlobeNewswire" } },
      { title: "No time", article_url: "https://example.com/none" },
    ],
    NOW,
    LOOKBACK_MS,
  );
  assertEquals(mapped.length, 1);
  assertEquals(mapped[0].source, "GlobeNewswire");
});

Deno.test("duplicate URL/headline is deduped and newest wins", () => {
  const merged = mergeRadarNewsArticles([
    {
      title: "Company announces new distribution agreement",
      source: "Massive",
      published_at: "2026-09-16T10:00:00.000Z",
      url: "https://example.com/story/",
      provider: "massive",
    },
    {
      title: "Company announces new distribution agreement",
      source: "GlobeNewswire",
      published_at: "2026-09-16T18:00:00.000Z",
      url: "https://example.com/story",
      provider: "finnhub",
    },
  ]);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].provider, "finnhub");
  assertEquals(merged[0].published_at, "2026-09-16T18:00:00.000Z");
});

Deno.test("Finnhub failure + Massive success still returns the fresh article", () => {
  const result = assembleRadarNewsResponse(
    "DLXY",
    { ok: false },
    {
      ok: true,
      payload: [{ title: "Delixy distribution agreement", published_utc: "2026-09-16T19:00:00.000Z" }],
    },
    NOW,
  );
  assertEquals(result.status, "ok");
  assertEquals(result.articles[0].provider, "massive");
});

Deno.test("Massive failure + Finnhub success still returns the fresh article", () => {
  const result = assembleRadarNewsResponse(
    "AEHL",
    {
      ok: true,
      payload: [{
        headline: "Antelope Enterprise closes $6M convertible note offering",
        source: "GlobeNewswire",
        datetime: NOW / 1000 - 600,
      }],
    },
    { ok: false },
    NOW,
  );
  assertEquals(result.status, "ok");
  assertEquals(result.articles[0].provider, "finnhub");
});

Deno.test("fresh Massive article is used when Finnhub is successfully empty", () => {
  const result = assembleRadarNewsResponse(
    "AEHL",
    { ok: true, payload: [] },
    {
      ok: true,
      payload: [{ title: "Fresh Massive PR", published_utc: "2026-09-16T19:00:00.000Z" }],
    },
    NOW,
  );
  assertEquals(result.status, "ok");
  assertEquals(result.articles[0].provider, "massive");
  assertEquals(result.articles[0].title, "Fresh Massive PR");
});

Deno.test("both successful choose the newest fresh article", () => {
  const result = assembleRadarNewsResponse(
    "AEHL",
    {
      ok: true,
      payload: [{ headline: "Older PR", source: "Wire", datetime: NOW / 1000 - 3600 }],
    },
    {
      ok: true,
      payload: [{ title: "Newer PR", published_utc: "2026-09-16T19:30:00.000Z" }],
    },
    NOW,
  );
  assertEquals(result.articles[0].title, "Newer PR");
  assertEquals(result.articles[0].provider, "massive");
});

Deno.test("both fresh-empty is empty and cacheable; both fail is unavailable and not cached", () => {
  const empty = assembleRadarNewsResponse("GLOO", { ok: true, payload: [] }, { ok: true, payload: [] }, NOW);
  assertEquals(empty.status, "empty");
  assertEquals(shouldCacheRadarNews(empty.status), true);

  const failed = assembleRadarNewsResponse("GLOO", { ok: false }, { ok: false }, NOW);
  assertEquals(failed.status, "unavailable");
  assertEquals(shouldCacheRadarNews(failed.status), false);
});

Deno.test("Finnhub date window covers the lookback plus a calendar-day buffer", () => {
  const window = finnhubDateWindow(NOW, 24);
  assertEquals(window.to, "2026-09-16");
  assertEquals(window.from, "2026-09-14");
});
