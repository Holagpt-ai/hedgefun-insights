import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyCatalyst } from "../classify.ts";

Deno.test("META-like AI glasses product news is not FDA/biotech", () => {
  assertEquals(
    classifyCatalyst("Meta unveils next-generation AI smart glasses at Connect"),
    "product_contract",
  );
  assertEquals(
    classifyCatalyst("Meta Connect 2026: Orion glasses enter phase 3 consumer rollout"),
    "product_contract",
  );
  assertEquals(
    classifyCatalyst("FDA clears Meta Ray-Ban smart glasses for wellness features"),
    "product_contract",
  );
});

Deno.test("GUTS-like shareholder legal notices classify as legal", () => {
  assertEquals(
    classifyCatalyst("GUTS Shareholder Alert: Law Firm Announces Investigation of Securities Fraud"),
    "legal",
  );
  assertEquals(
    classifyCatalyst("Phase 2 investigation into Meta Platforms securities violations"),
    "legal",
  );
});

Deno.test("true biotech FDA headlines still classify as fda_biotech", () => {
  assertEquals(
    classifyCatalyst("FDA approves new PDUFA drug for late-stage oncology"),
    "fda_biotech",
  );
  assertEquals(
    classifyCatalyst("Company reports Phase 3 trial met primary endpoint"),
    "fda_biotech",
  );
});
