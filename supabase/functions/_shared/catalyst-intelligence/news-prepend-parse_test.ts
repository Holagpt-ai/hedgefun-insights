import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseRssOrAtom } from "./feeds.ts";

function rssFeedWithPrepended(prefixGuids: string[], baseCount: number): string {
  const guids = [...prefixGuids, ...Array.from({ length: baseCount }, (_, index) => `gnw-${index}`)];
  const items = guids.map((guid, index) => `<item>
<title>Issuer ${index} USA L.L.C. announces quarterly results</title>
<link>https://www.globenewswire.com/news-release/${guid}</link>
<guid isPermaLink="false">${guid}</guid>
<pubDate>Wed, 01 Oct 2026 12:00:00 GMT</pubDate>
<description>The company will host a call.</description>
</item>`).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>GNW</title>${items}</channel></rss>`;
}

Deno.test("prepended rss fixture parses 42 items", () => {
  const body = rssFeedWithPrepended(["gnw-prepend-0", "gnw-prepend-1"], 40);
  assertEquals(parseRssOrAtom(body).length, 42);
});
