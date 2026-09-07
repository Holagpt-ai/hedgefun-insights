import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLatestFilingsAtomUrl,
  SEC_LATEST_FILINGS_OWNER,
  SEC_LATEST_FILINGS_PAGE_SIZE,
} from "./ingest.ts";
import {
  applyCheckpointCas,
  dedupeEntriesByAccession,
  normalizeAnchorAccessions,
  pageContainsAnyAnchor,
  parseLoadedCheckpoint,
  parseRevision,
  SEC_EDGAR_STREAM_KEY,
  uniqueAccessionsInOrder,
  walkLatestFilingsPages,
} from "./checkpoint.ts";
import type { SecFeedEntry, SecFetchResult } from "./ingest.ts";

function entry(acc: string, form = "8-K"): SecFeedEntry {
  return {
    form_type: form,
    cik: "0001045810",
    company_name: "NVIDIA CORP",
    accession_number: acc,
    filing_date: "2026-09-07",
    accepted_at: "2026-09-07T17:17:00.000Z",
    filing_url: "https://www.sec.gov/Archives/edgar/data/1045810/a-index.htm",
    primary_document: null,
    sec_items: null,
  };
}

function feedXml(accessions: string[]): string {
  const entries = accessions.map((acc) => `
  <entry>
    <title>8-K - NVIDIA CORP (0001045810) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/${acc.replaceAll("-", "")}/${acc}-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=${acc}</id>
    <updated>2026-09-07T13:17:00-04:00</updated>
    <summary type="html">Filed: 2026-09-07 AccNo: ${acc}</summary>
    <category scheme="https://www.sec.gov/" term="8-K" />
  </entry>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`;
}

function pagesFetch(pages: Record<number, string[] | "error">) {
  return async (url: string): Promise<SecFetchResult> => {
    const start = Number(new URL(url).searchParams.get("start") ?? "0");
    const page = pages[start];
    if (page === "error") return { ok: false, reason: "PROVIDER_ERROR" };
    if (!page) return { ok: true, status: 200, text: feedXml([]), json: null };
    return { ok: true, status: 200, text: feedXml(page), json: null };
  };
}

Deno.test("official Latest Filings URL uses owner=exclude, count=100, and start=", () => {
  const url = buildLatestFilingsAtomUrl(200);
  assertEquals(url.includes("action=getcurrent"), true);
  assertEquals(url.includes(`owner=${SEC_LATEST_FILINGS_OWNER}`), true);
  assertEquals(url.includes(`count=${SEC_LATEST_FILINGS_PAGE_SIZE}`), true);
  assertEquals(url.includes("start=200"), true);
  assertEquals(url.includes("output=atom"), true);
  assertEquals(url.includes("owner=include"), false);
});

Deno.test("accession anchors are identity matches, not numeric comparisons", () => {
  assertEquals(
    pageContainsAnyAnchor(["0000000002-26-000001", "0000000001-26-000099"], ["0000000001-26-000099"]),
    true,
  );
  assertEquals(pageContainsAnyAnchor(["0000000009-26-000001"], ["0000000001-26-000099"]), false);
  assertEquals(normalizeAnchorAccessions(["0001045810-26-000001", "bad"]), null);
});

Deno.test("walk bootstraps from page 0 only when no checkpoint", async () => {
  const walk = await walkLatestFilingsPages(
    pagesFetch({ 0: ["0001045810-26-000001"], 100: ["0001045810-26-000099"] }),
    null,
  );
  assertEquals(walk.ok, true);
  if (!walk.ok) return;
  assertEquals(walk.checkpointStatus, "bootstrapped");
  assertEquals(walk.pagesFetched, 1);
  assertEquals(walk.page0Accessions, ["0001045810-26-000001"]);
});

Deno.test("walk stops on page 0 when any previous anchor is present", async () => {
  const walk = await walkLatestFilingsPages(
    pagesFetch({
      0: ["0001045810-26-000010", "0001045810-26-000001"],
      100: ["0001045810-26-000099"],
    }),
    ["0001045810-26-000001"],
  );
  assertEquals(walk.ok, true);
  if (!walk.ok) return;
  assertEquals(walk.boundaryReached, true);
  assertEquals(walk.pagesFetched, 1);
});

Deno.test("walk continues to start=200 until an anchor is found", async () => {
  const walk = await walkLatestFilingsPages(
    pagesFetch({
      0: ["0001045810-26-000030"],
      100: ["0001045810-26-000020"],
      200: ["0001045810-26-000010"],
    }),
    ["0001045810-26-000010"],
  );
  assertEquals(walk.ok, true);
  if (!walk.ok) return;
  assertEquals(walk.pagesFetched, 3);
  assertEquals(walk.boundaryReached, true);
  assertEquals(uniqueAccessionsInOrder(walk.entries).length, 3);
});

Deno.test("walk fail-closes with CHECKPOINT_GAP when max pages never see the anchor", async () => {
  const pages: Record<number, string[]> = {};
  for (let i = 0; i < 20; i += 1) {
    pages[i * 100] = [`0001045810-26-${String(i).padStart(6, "0")}`];
  }
  const walk = await walkLatestFilingsPages(
    pagesFetch(pages),
    ["0009999999-26-000001"],
  );
  assertEquals(walk.ok, false);
  if (walk.ok) return;
  assertEquals(walk.reason, "CHECKPOINT_GAP");
  assertEquals(walk.pagesFetched, 20);
});

Deno.test("empty later page is CHECKPOINT_INCONSISTENT, not a silent reset", async () => {
  const walk = await walkLatestFilingsPages(
    pagesFetch({
      0: ["0001045810-26-000030"],
      100: [],
    }),
    ["0001045810-26-000001"],
  );
  assertEquals(walk.ok, false);
  if (walk.ok) return;
  assertEquals(walk.reason, "CHECKPOINT_INCONSISTENT");
});

Deno.test("provider error after page 0 does not report success", async () => {
  const walk = await walkLatestFilingsPages(
    pagesFetch({
      0: ["0001045810-26-000030"],
      100: "error",
    }),
    ["0001045810-26-000001"],
  );
  assertEquals(walk.ok, false);
  if (walk.ok) return;
  assertEquals(walk.reason, "PROVIDER_ERROR");
  assertEquals(walk.pagesFetched, 1);
});

function acc(n: number): string {
  return `0001045810-26-${String(n).padStart(6, "0")}`;
}

Deno.test("normalizeAnchorAccessions accepts 1..100 unique identities", () => {
  assertEquals(normalizeAnchorAccessions([acc(1)]), [acc(1)]);
  const hundred = Array.from({ length: 100 }, (_, i) => acc(i + 1));
  assertEquals(normalizeAnchorAccessions(hundred)?.length, 100);
});

Deno.test("normalizeAnchorAccessions rejects empty, oversized, and malformed", () => {
  assertEquals(normalizeAnchorAccessions([]), null);
  assertEquals(normalizeAnchorAccessions(Array.from({ length: 101 }, (_, i) => acc(i + 1))), null);
  assertEquals(normalizeAnchorAccessions(["0001045810-26-000001", "bad"]), null);
  assertEquals(normalizeAnchorAccessions("0001045810-26-000001"), null);
  assertEquals(normalizeAnchorAccessions(null), null);
});

Deno.test("parseRevision accepts integer >= 0 only", () => {
  assertEquals(parseRevision(0), 0);
  assertEquals(parseRevision(4), 4);
  assertEquals(parseRevision("4"), 4);
  assertEquals(parseRevision(-1), null);
  assertEquals(parseRevision(1.5), null);
  assertEquals(parseRevision("01"), null);
  assertEquals(parseRevision(null), null);
});

Deno.test("parseLoadedCheckpoint rejects invalid state without placeholders", () => {
  const valid = {
    stream_key: SEC_EDGAR_STREAM_KEY,
    anchor_accessions: [acc(1)],
    revision: 4,
    anchor_observed_at: "2026-09-07T00:00:00.000Z",
    last_success_at: "2026-09-07T00:00:00.000Z",
    head_updated_at: null,
    pages_fetched: 1,
  };
  assertEquals(parseLoadedCheckpoint(valid).ok, true);
  assertEquals(parseLoadedCheckpoint({ ...valid, stream_key: "other" }).ok, false);
  assertEquals(parseLoadedCheckpoint({ ...valid, revision: -1 }).ok, false);
  assertEquals(parseLoadedCheckpoint({ ...valid, anchor_accessions: [] }).ok, false);
  assertEquals(parseLoadedCheckpoint({ ...valid, anchor_accessions: ["invalid"] }).ok, false);
});

Deno.test("CAS advances current revision and rejects stale expected revision", () => {
  const current = {
    stream_key: SEC_EDGAR_STREAM_KEY,
    anchor_accessions: [acc(1)],
    revision: 4,
    anchor_observed_at: "2026-09-07T00:00:00.000Z",
    last_success_at: "2026-09-07T00:00:00.000Z",
    head_updated_at: null,
    pages_fetched: 1,
  };
  const newer = applyCheckpointCas(current, {
    expectedRevision: 4,
    nextCheckpoint: { ...current, anchor_accessions: [acc(2)], revision: 5 },
  });
  assertEquals(newer.ok, true);
  if (!newer.ok) return;
  assertEquals(newer.checkpoint.revision, 5);
  assertEquals(newer.checkpoint.anchor_accessions, [acc(2)]);

  const stale = applyCheckpointCas(newer.checkpoint, {
    expectedRevision: 4,
    nextCheckpoint: { ...current, anchor_accessions: [acc(9)], revision: 5 },
  });
  assertEquals(stale.ok, false);
  if (stale.ok) return;
  assertEquals(stale.reason, "CHECKPOINT_CONFLICT");
  assertEquals(newer.checkpoint.anchor_accessions, [acc(2)]);
});

Deno.test("bootstrap insert-if-absent succeeds once and rejects a competitor", () => {
  const seed = {
    stream_key: SEC_EDGAR_STREAM_KEY,
    anchor_accessions: [acc(1)],
    revision: 0,
    anchor_observed_at: "2026-09-07T00:00:00.000Z",
    last_success_at: "2026-09-07T00:00:00.000Z",
    head_updated_at: null,
    pages_fetched: 1,
  };
  const first = applyCheckpointCas(null, { expectedRevision: null, nextCheckpoint: seed });
  assertEquals(first.ok, true);
  if (!first.ok) return;
  assertEquals(first.checkpoint.revision, 0);

  const second = applyCheckpointCas(first.checkpoint, {
    expectedRevision: null,
    nextCheckpoint: { ...seed, anchor_accessions: [acc(9)] },
  });
  assertEquals(second.ok, false);
  if (second.ok) return;
  assertEquals(second.reason, "CHECKPOINT_CONFLICT");
  assertEquals(first.checkpoint.anchor_accessions, [acc(1)]);
});

Deno.test("dedupeEntriesByAccession keeps first-seen identity", () => {
  const rows = dedupeEntriesByAccession([
    entry("0001045810-26-000001", "8-K"),
    entry("0001045810-26-000001", "8-K"),
    entry("0000002222-26-000100", "10-Q"),
  ]);
  assertEquals(rows.map((r) => r.accession_number), [
    "0001045810-26-000001",
    "0000002222-26-000100",
  ]);
});
