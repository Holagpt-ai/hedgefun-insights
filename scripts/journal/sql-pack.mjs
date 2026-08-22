import { createHash } from "node:crypto";

// Canonical production Journal SQL under supabase/migrations/20260821* is
// verify-only. Packagers must not rewrite, reformat, or normalize those files.

export const RS = "\x1e";
export const SIZE_LIMIT = 20000;

export function utf8Bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

export function md5Statements(parts) {
  return createHash("md5").update(parts.join(RS), "utf8").digest("hex");
}

export function pickDollarTag(texts, base) {
  const joined = Array.isArray(texts) ? texts.join("\n") : String(texts);
  let n = 0;
  let tag = base;
  while (joined.includes(`$${tag}$`)) {
    n += 1;
    tag = `${base}${n}`;
  }
  return tag;
}

export function splitSqlStatements(sql) {
  const statements = [];
  const n = sql.length;
  let i = 0;

  const skipWsAndComments = () => {
    while (i < n) {
      if (sql[i] === " " || sql[i] === "\t" || sql[i] === "\r" || sql[i] === "\n") {
        i += 1;
        continue;
      }
      if (sql.startsWith("--", i)) {
        const nl = sql.indexOf("\n", i);
        i = nl === -1 ? n : nl + 1;
        continue;
      }
      if (sql.startsWith("/*", i)) {
        const end = sql.indexOf("*/", i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      break;
    }
  };

  while (i < n) {
    skipWsAndComments();
    if (i >= n) break;
    const start = i;
    let inSingle = false;
    while (i < n) {
      const ch = sql[i];
      if (!inSingle && ch === "$") {
        const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
        if (m) {
          const tag = m[0];
          const close = sql.indexOf(tag, i + tag.length);
          if (close === -1) throw new Error(`unclosed dollar quote ${tag}`);
          i = close + tag.length;
          continue;
        }
      }
      if (!inSingle && sql.startsWith("--", i)) {
        const nl = sql.indexOf("\n", i);
        i = nl === -1 ? n : nl + 1;
        continue;
      }
      if (!inSingle && sql.startsWith("/*", i)) {
        const end = sql.indexOf("*/", i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      if (ch === "'" && !inSingle) {
        inSingle = true;
        i += 1;
        continue;
      }
      if (ch === "'" && inSingle) {
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inSingle = false;
        i += 1;
        continue;
      }
      if (!inSingle && ch === ";") {
        const stmt = sql.slice(start, i).trim();
        if (stmt) statements.push(stmt);
        i += 1;
        break;
      }
      i += 1;
    }
    if (i >= n && start < n) {
      const stmt = sql.slice(start).trim();
      if (stmt) statements.push(stmt);
    }
  }
  return statements;
}

export function toLf(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function wrapAtomic(statements, { segTag = "journal_seg", header = "" } = {}) {
  if (statements.length === 0) throw new Error("no statements to wrap");
  // Normalize to LF so Windows checkouts and GitHub Actions hash the same
  // payload. A trailing newline keeps inner $$ closers from fusing with the
  // wrapper tag and is included in the hashed payload.
  const bodies = statements.map((s) => `${toLf(s).replace(/\n+$/, "")}\n`);
  const stmtTag = pickDollarTag(bodies, "journal_stmt");
  const digest = md5Statements(bodies);
  const items = bodies.map((s) => `    $${stmtTag}$${s}$${stmtTag}$`).join(",\n");
  const body = `-- integrity-md5: ${digest}
DO $${segTag}$
DECLARE
  v_statements text[] := ARRAY[
${items}
  ];
  v_expected text := '${digest}';
  v_digest text;
  v_stmt text;
BEGIN
  v_digest := md5(array_to_string(v_statements, E'\\x1e'));
  IF v_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'journal migration integrity mismatch: expected %, got %',
      v_expected,
      v_digest;
  END IF;
  FOREACH v_stmt IN ARRAY v_statements LOOP
    EXECUTE v_stmt;
  END LOOP;
END;
$${segTag}$;
`;
  return {
    digest,
    sql: `${header}${header && !header.endsWith("\n") ? "\n" : ""}${body}`,
  };
}

export function extractFunction(sql, name) {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  if (start < 0) throw new Error(`missing function ${name}`);
  const rest = sql.slice(start);
  const as = rest.match(/AS (\$[A-Za-z0-9_]*\$)/);
  if (!as) throw new Error(`missing AS dollar tag for ${name}`);
  const tag = as[1];
  const open = sql.indexOf(as[0], start);
  const close = sql.indexOf(`${tag};`, open + as[0].length);
  if (close < 0) throw new Error(`unclosed function body for ${name}`);
  return sql.slice(start, close + tag.length + 1).replace(/;$/, "").trim();
}

export function sliceBetween(sql, startNeedle, endNeedle) {
  const start = sql.indexOf(startNeedle);
  if (start < 0) throw new Error(`missing start ${startNeedle}`);
  const end = endNeedle ? sql.indexOf(endNeedle, start) : sql.length;
  if (end < 0) throw new Error(`missing end ${endNeedle}`);
  return sql.slice(start, end);
}
