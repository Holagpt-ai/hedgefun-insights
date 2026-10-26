#!/usr/bin/env node
/**
 * Read-only Batch 175 probe — uses local .env anon key only.
 * Does not write. Fails closed when RPC/table access is denied.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

const AM_DATE =
  process.argv[2] ?? process.env.BATCH175_AM_SESSION_DATE ?? "2026-10-27";
const SOURCE_DATE = process.env.BATCH175_SOURCE_SESSION_DATE ?? "2026-10-26";

if (!url || !key) {
  console.log(JSON.stringify({ error: "missing_supabase_env", amDate: AM_DATE }));
  process.exit(2);
}

async function postRpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function getTable(filter) {
  const res = await fetch(`${url}/rest/v1/late_session_continuation_handoffs?${filter}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

const rpc = await postRpc("late_session_handoff_list_active_v1", { p_am_session_date: AM_DATE });
const sourceRows = await getTable(
  `source_session_date=eq.${SOURCE_DATE}&select=symbol,source_category,valid_from_session_date,valid_through_session_date,source_timestamp&order=symbol.asc`,
);

/** @type {Record<string, number>} */
const byCategoryMonday = {};
/** @type {Record<string, number>} */
const bySourceDate = {};
let mondayRows = [];
let rpcRows = [];

if (Array.isArray(rpc.json)) {
  rpcRows = rpc.json;
  for (const row of rpcRows) {
    const d = row.source_session_date;
    bySourceDate[d] = (bySourceDate[d] ?? 0) + 1;
    if (d === SOURCE_DATE) {
      mondayRows.push(row);
      byCategoryMonday[row.source_category] = (byCategoryMonday[row.source_category] ?? 0) + 1;
    }
  }
}

const mondaySymbols = new Set(mondayRows.map((r) => r.symbol));

let mondayEligibleForAm = 0;
let mondayWrongValidFrom = 0;
for (const row of mondayRows) {
  if (row.valid_from_session_date === AM_DATE) mondayEligibleForAm += 1;
  else mondayWrongValidFrom += 1;
}

console.log(
  JSON.stringify(
    {
      probe: "batch175-readonly-handoff-probe",
      supabaseHost: new URL(url).hostname,
      amSessionDate: AM_DATE,
      sourceSessionDate: SOURCE_DATE,
      rpcListActive: {
        status: rpc.status,
        totalRowCount: rpcRows.length,
        mondaySourceRowCount: mondayRows.length,
        mondayUniqueSymbolCount: mondaySymbols.size,
        mondayByCategory: byCategoryMonday,
        mondayRowsMatchingValidFromAmDate: mondayEligibleForAm,
        mondayRowsWrongValidFrom: mondayWrongValidFrom,
        rpcBySourceDate: Object.fromEntries(
          Object.entries(bySourceDate).sort((a, b) => b[1] - a[1]).slice(0, 12),
        ),
        sampleMonday: mondayRows.slice(0, 8).map((r) => ({
          symbol: r.symbol,
          source_category: r.source_category,
          valid_from_session_date: r.valid_from_session_date,
          valid_through_session_date: r.valid_through_session_date,
          source_timestamp: r.source_timestamp,
        })),
      },
      tableDirectSelect: {
        status: sourceRows.status,
        rowCount: Array.isArray(sourceRows.json) ? sourceRows.json.length : null,
        error: Array.isArray(sourceRows.json) ? null : sourceRows.json,
      },
      note:
        "RPC is SECURITY DEFINER (readable with publishable key). Direct table SELECT requires authenticated role.",
    },
    null,
    2,
  ),
);
