/**
 * Gate H — read-only classification (Deno). Requires HISTORICAL_PRODUCTION_DATABASE_URL.
 */
import postgres from "npm:postgres@3.4.5";
import {
  classifyHistoricalSecRow,
  SEC_V1C_REMEDIATION_POLICY_VERSION,
  summarizeSecHistoricalClassifications,
  type CikTickerMap,
  type SecHistoricalRowInput,
} from "../../supabase/functions/_shared/sec-edgar/sec-v1c-historical-classification.ts";
import {
  parseCompanyTickersExchangeJson,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
} from "../../supabase/functions/_shared/sec-edgar/ingest.ts";

const REVIEWED_BY = "sec-v1c-classifier";

function loadEnv(): void {
  for (const file of [".env", ".env.local"]) {
    try {
      const text = Deno.readTextFileSync(file);
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i <= 0) continue;
        const key = line.slice(0, i);
        let value = line.slice(i + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (Deno.env.get(key) === undefined) Deno.env.set(key, value);
      }
    } catch {
      // optional
    }
  }
}

function requireDbUrl(): string {
  const url = (
    Deno.env.get("HISTORICAL_PRODUCTION_DATABASE_URL")
    ?? Deno.env.get("LOVABLE_DB_MIGRATION_URL")
    ?? Deno.env.get("SUPABASE_DB_URL")
    ?? Deno.env.get("DATABASE_URL")
    ?? ""
  ).trim();
  if (!url.includes("zcjptaolpumhtlwhlemq")) {
    throw new Error("approved zcjptaolpumhtlwhlemq database URL required");
  }
  return url;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function fetchCikMap(): Promise<CikTickerMap> {
  const res = await fetch(SEC_COMPANY_TICKERS_EXCHANGE_URL, {
    headers: {
      "User-Agent": Deno.env.get("SEC_USER_AGENT")
        ?? "Stocksist SEC remediation classify (contact ops)",
    },
  });
  if (!res.ok) throw new Error(`SEC CIK map fetch failed: ${res.status}`);
  return parseCompanyTickersExchangeJson(await res.json());
}

loadEnv();
const reviewedAt = new Date().toISOString();
const sql = postgres(requireDbUrl(), { max: 2, prepare: false });

try {
  const dbRows = await sql<
    {
      dedupe_key: string;
      symbol: string;
      company_name: string | null;
      provider: string;
      provider_article_id: string | null;
      verification_state: string;
      facts: Record<string, unknown>;
    }[]
  >`
    SELECT dedupe_key, symbol, company_name, provider, provider_article_id, verification_state, facts
    FROM public.catalyst_events
    WHERE provider = 'sec_edgar' AND dedupe_key LIKE 'sec:%'
    ORDER BY published_at DESC NULLS LAST, dedupe_key ASC
  `;

  const cikMap = await fetchCikMap();
  const inputs: SecHistoricalRowInput[] = dbRows.map((r) => ({
    dedupe_key: r.dedupe_key,
    symbol: r.symbol,
    company_name: r.company_name,
    provider: r.provider,
    provider_article_id: r.provider_article_id,
    verification_state: r.verification_state,
    facts: r.facts ?? {},
  }));

  const results = inputs.map((row) => classifyHistoricalSecRow(row, cikMap));
  const summary = summarizeSecHistoricalClassifications(results);

  const allowlistLines = [
    "dedupe_key,reason,reviewed_by,reviewed_at",
    ...results
      .filter((r) => r.classification === "confirmed_misattribution")
      .map((r) => [r.dedupe_key, r.reason_code, REVIEWED_BY, reviewedAt].map(csvEscape).join(",")),
  ];
  const unresolvedLines = [
    "dedupe_key,reason_code,form_type,cik",
    ...results
      .filter((r) => r.classification === "unresolved")
      .map((r) => [r.dedupe_key, r.reason_code, r.form_type ?? "", r.cik ?? ""].map(csvEscape).join(",")),
  ];

  await Deno.writeTextFile(
    "docs/sec-edgar/remediation/sec-v1c-misattribution-allowlist.csv",
    `${allowlistLines.join("\n")}\n`,
  );
  await Deno.writeTextFile(
    "docs/sec-edgar/remediation/sec-v1c-unresolved-candidates.csv",
    `${unresolvedLines.join("\n")}\n`,
  );

  const report = {
    generated_at: new Date().toISOString(),
    policy_version: SEC_V1C_REMEDIATION_POLICY_VERSION,
    project: "zcjptaolpumhtlwhlemq",
    summary,
  };
  await Deno.writeTextFile(
    "docs/sec-edgar/remediation/gate-h-classification-report.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
