#!/usr/bin/env node
/**
 * Read-only ISS-034 job replay probe. Uses local .env anon key only.
 * Does not write production state.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));

const jobId =
  process.argv[2] ?? "4ed4a4c7-d8c4-4582-bd89-cc949d6e291d";
const includeTickers = process.argv.includes("--tickers");

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log(JSON.stringify({ error: "missing_supabase_env" }));
  process.exit(2);
}

const select = includeTickers
  ? "id,status,abort_reason,observation,merged_artifacts,all_tickers"
  : "id,status,abort_reason,observation,merged_artifacts";

const res = await fetch(
  `${url}/rest/v1/screener_sync_generation_jobs?id=eq.${jobId}&select=${select}`,
  {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  },
);

const body = await res.text();
let json;
try {
  json = body ? JSON.parse(body) : null;
} catch {
  json = { raw: body.slice(0, 500) };
}

const out = { http_status: res.status, job_id: jobId, include_tickers: includeTickers };
if (Array.isArray(json) && json[0]) {
  const row = json[0];
  out.status = row.status;
  out.abort_reason = row.abort_reason;
  out.observation = row.observation;
  out.merged_artifacts = row.merged_artifacts;
  if (includeTickers && Array.isArray(row.all_tickers)) {
    out.all_tickers_count = row.all_tickers.length;
    fs.writeFileSync(
      path.join(process.cwd(), ".tmp-iss034-all-tickers.json"),
      JSON.stringify(row.all_tickers),
    );
    out.wrote = ".tmp-iss034-all-tickers.json";
  }
} else {
  out.body = json;
}

console.log(JSON.stringify(out, null, 2));