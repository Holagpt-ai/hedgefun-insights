import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyCatalystPrecedence,
  compareCatalystPrecedence,
  detectPrimaryEventClass,
  looksLikeMarketAttention,
  type CatalystPrecedenceInput,
} from "./precedence.ts";

const base = (o: Partial<CatalystPrecedenceInput> = {}): CatalystPrecedenceInput & { symbol: string } => ({
  symbol: "XYZ",
  title: "Company news update",
  event_type: "company_news",
  provider: "polygon",
  event_date: "2026-09-18",
  published_at: "2026-09-18T10:00:00.000Z",
  attribution_class: "direct",
  ticker_specific: true,
  ...o,
});

const commentary = (title: string, extra: Partial<CatalystPrecedenceInput> = {}) =>
  base({ title, event_type: "company_news", ...extra });

Deno.test("1. FDA approval outranks commentary", () => {
  const primary = base({
    title: "FDA approves XYZ therapy for rare disease",
    event_type: "fda_biotech",
  });
  const secondary = commentary("Bull of the Day: XYZ");
  assertEquals(classifyCatalystPrecedence(primary).tier, "primary");
  assertEquals(classifyCatalystPrecedence(secondary).tier, "secondary");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("2. FDA rejection outranks commentary", () => {
  const primary = base({
    title: "FDA issues complete response letter to XYZ drug application",
    event_type: "fda_biotech",
  });
  const secondary = commentary("Which stock is better: XYZ vs ABC?");
  assertEquals(classifyCatalystPrecedence(primary).tier, "primary");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("3. clinical results outrank commentary", () => {
  const primary = base({
    title: "XYZ reports Phase 3 primary endpoint success",
    event_type: "fda_biotech",
  });
  const secondary = commentary("Top stocks to watch this week");
  assertEquals(classifyCatalystPrecedence(primary).primaryClass, "clinical_results");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("4. earnings/guidance outrank commentary", () => {
  const primary = base({
    title: "XYZ raises FY guidance after earnings beat",
    event_type: "earnings",
  });
  const secondary = commentary("Analyst commentary on XYZ momentum");
  assertEquals(classifyCatalystPrecedence(primary).tier, "primary");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("5. acquisition outranks commentary", () => {
  const primary = base({
    title: "XYZ signs definitive agreement to acquire ABC for $2B",
    event_type: "merger_acquisition",
  });
  const secondary = commentary("Featured highlights from today's movers");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("6. contract/government award outranks commentary", () => {
  const primary = base({
    title: "XYZ awarded $25M NASA contract",
    event_type: "product_contract",
  });
  const secondary = commentary("Stock picks for September");
  assertEquals(classifyCatalystPrecedence(primary).primaryClass, "contract_award");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("7. material SEC filing outranks commentary", () => {
  const primary = base({
    title: "XYZ files 8-K disclosing CEO resignation",
    event_type: "sec_filing_news",
  });
  const secondary = commentary("Is XYZ still a buy?");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("8. financing/dilution outranks commentary", () => {
  const primary = base({
    title: "XYZ prices $50M public offering",
    event_type: "corporate_action",
  });
  const secondary = commentary("Momentum stock pick: XYZ");
  assertEquals(classifyCatalystPrecedence(primary).primaryClass, "financing_capital");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("9. strategic agreement outranks commentary", () => {
  const primary = base({
    title: "XYZ enters licensing agreement with ABC",
    event_type: "product_contract",
  });
  const secondary = commentary("Wall Street says XYZ looks interesting");
  assertEquals(classifyCatalystPrecedence(primary).primaryClass, "strategic_agreement");
  assertEquals(compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("10. generic roundup classified secondary", () => {
  const row = commentary("Zacks.com featured highlights Vince, Cognyte and Magnolia Oil & Gas");
  assertEquals(classifyCatalystPrecedence(row).tier, "secondary");
  assertEquals(looksLikeMarketAttention(row.title), true);
});

Deno.test("11. Bull of the Day classified secondary", () => {
  const row = commentary("Bull of the Day: AXTI");
  assertEquals(classifyCatalystPrecedence(row).tier, "secondary");
});

Deno.test("12. Which stock is better classified secondary", () => {
  const row = commentary("Tesla vs SpaceX: Which Is the Better Elon Musk-Backed Stock to Buy?");
  assertEquals(classifyCatalystPrecedence(row).tier, "secondary");
});

Deno.test("13. newer commentary does not outrank older verified primary catalyst", () => {
  const olderPrimary = {
    ...base({
      title: "FDA approves OLD therapy",
      event_type: "fda_biotech",
      event_date: "2026-09-17",
      published_at: "2026-09-17T08:00:00.000Z",
    }),
    symbol: "OLD",
  };
  const newerCommentary = {
    ...commentary("Bull of the Day: NEW", {
      published_at: "2026-09-18T12:00:00.000Z",
    }),
    symbol: "NEW",
  };
  assertEquals(
    compareCatalystPrecedence(olderPrimary, newerCommentary, { owned: new Set(), etDate: "2026-09-18" }) < 0,
    true,
  );
});

Deno.test("14. negative primary catalyst retains precedence", () => {
  const negative = base({
    title: "XYZ trial failed primary endpoint in Phase 3 study",
    event_type: "fda_biotech",
  });
  const commentaryRow = commentary("Best stocks to buy now");
  assertEquals(classifyCatalystPrecedence(negative).tier, "primary");
  assertEquals(compareCatalystPrecedence(negative, commentaryRow, { owned: new Set(), etDate: "2026-09-18" }) < 0, true);
});

Deno.test("15. editorial wrapper rescued when underlying event evidence is explicit", () => {
  const row = commentary(
    "Why XYZ jumped today after FDA approves new therapy",
    { event_type: "company_news" },
  );
  assertEquals(classifyCatalystPrecedence(row).tier, "primary");
  assertEquals(classifyCatalystPrecedence(row).primaryClass, "fda_regulatory");
});

Deno.test("16. vague stock jumped cannot rescue into primary catalyst", () => {
  const row = commentary("Why XYZ stock jumped today on company news", {
    event_type: "company_news",
  });
  assertEquals(classifyCatalystPrecedence(row).tier, "secondary");
  assertEquals(detectPrimaryEventClass(row.title), null);
});

Deno.test("17. no symbol-specific hardcoding in precedence rules", () => {
  const arbitrary = {
    ...base({ title: "FDA approves QWER therapy", event_type: "fda_biotech" }),
    symbol: "QWER",
  };
  const other = {
    ...base({ title: "Bull of the Day: ZXCV" }),
    symbol: "ZXCV",
  };
  assertEquals(classifyCatalystPrecedence(arbitrary).tier, "primary");
  assertEquals(classifyCatalystPrecedence(other).tier, "secondary");
});
