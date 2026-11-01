import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fnRoot = path.join(root, "supabase", "functions");

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function localImports(file) {
  const text = fs.readFileSync(file, "utf8");
  const specs = [];
  for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) specs.push(match[1]);
  for (const match of text.matchAll(/import\s+["']([^"']+)["']/g)) specs.push(match[1]);
  return specs;
}

function transitiveClosure(entryFile) {
  const queue = [path.resolve(entryFile)];
  const seen = new Set();
  const files = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!fs.existsSync(file)) continue;
    files.push(file);
    for (const spec of localImports(file)) {
      const resolved = resolveImport(file, spec);
      if (!resolved) continue;
      if (!resolved.includes(path.join("supabase", "functions"))) continue;
      queue.push(resolved);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function hashFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    hash.update(`${rel}\0`);
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const entry = path.join(fnRoot, "sync-screener-data", "index.ts");
const closure = transitiveClosure(entry);
const submitted = hashFiles(closure);

console.log(JSON.stringify({
  entry: path.relative(root, entry).split(path.sep).join("/"),
  runtime_closure_file_count: closure.length,
  runtime_closure_sha256: submitted,
  submitted_source_sha256: submitted,
  files: closure.map((f) => path.relative(root, f).split(path.sep).join("/")),
}, null, 2));
