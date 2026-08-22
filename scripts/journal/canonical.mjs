import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SIZE_LIMIT } from "./sql-pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const MAP_PATH = resolve(ROOT, "scripts/journal/production-migration-map.json");
export const MANIFEST_PATH = resolve(ROOT, "scripts/journal/runner-integrity.json");
export const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
export const FORBIDDEN_PREFIX = "20260816191";

export function loadProductionMigrationMap() {
  return JSON.parse(readFileSync(MAP_PATH, "utf8"));
}

export function extractIntegrityDigest(sql) {
  return sql.match(/-- integrity-md5: ([0-9a-f]{32})/)?.[1] ?? null;
}

export function toCanonicalSql(raw) {
  return Buffer.isBuffer(raw)
    ? raw.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    : String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function gitHashObject(relPath) {
  return execFileSync("git", ["hash-object", "--path", relPath, relPath], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

export function segmentByFormer(formerFile, map = loadProductionMigrationMap()) {
  const segment = map.segments.find((entry) => entry.formerFile === formerFile);
  if (!segment) {
    throw new Error(`unmapped former Journal migration ${formerFile}`);
  }
  return segment;
}

export function segmentByKind(kind, map = loadProductionMigrationMap()) {
  const segment = map.segments.find((entry) => entry.kind === kind);
  if (!segment) {
    throw new Error(`missing Journal map kind ${kind}`);
  }
  return segment;
}

function uniqueOrThrow(values, label) {
  const seen = new Set();
  const dupes = [];
  for (const value of values) {
    if (seen.has(value)) dupes.push(value);
    seen.add(value);
  }
  if (dupes.length) {
    throw new Error(`duplicate Journal ${label}: ${[...new Set(dupes)].join(", ")}`);
  }
}

export function verifyCanonicalMigrations({ integrityFiles = null } = {}) {
  const map = loadProductionMigrationMap();
  if (map.segments.length !== 26) {
    throw new Error(`expected 26 mapped Journal segments, got ${map.segments.length}`);
  }
  uniqueOrThrow(
    map.segments.map((segment) => segment.formerFile),
    "former filenames",
  );
  uniqueOrThrow(
    map.segments.map((segment) => segment.productionFile),
    "production filenames",
  );
  uniqueOrThrow(
    map.segments.map((segment) => segment.formerVersion),
    "former versions",
  );
  uniqueOrThrow(
    map.segments.map((segment) => segment.productionVersion),
    "production versions",
  );
  uniqueOrThrow(
    map.segments.map((segment) => `${segment.group}:${segment.kind}:${segment.formerVersion}`),
    "logical segments",
  );

  const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
  const forbidden = names.filter((name) => name.startsWith(FORBIDDEN_PREFIX));
  if (forbidden.length) {
    throw new Error(
      `forbidden executable 20260816191* Journal migrations still present: ${forbidden.join(", ")}`,
    );
  }
  for (const segment of map.segments) {
    if (names.includes(segment.formerFile)) {
      throw new Error(
        `both versions of ${segment.kind} are present: ${segment.formerFile} and ${segment.productionFile}`,
      );
    }
  }

  const journalOnDisk = names.filter((name) =>
    map.segments.some((segment) => segment.productionFile === name),
  );
  if (journalOnDisk.length !== 26) {
    throw new Error(
      `expected exactly 26 canonical Journal migration files, found ${journalOnDisk.length}`,
    );
  }

  const extraJournal = names.filter(
    (name) =>
      /^20260821\d{6}_[0-9a-f-]{36}\.sql$/.test(name) &&
      !map.segments.some((segment) => segment.productionFile === name),
  );
  if (extraJournal.length) {
    throw new Error(`unmapped 20260821* Journal-shaped files: ${extraJournal.join(", ")}`);
  }

  for (const segment of map.segments) {
    const path = resolve(MIGRATIONS_DIR, segment.productionFile);
    if (!existsSync(path)) {
      throw new Error(`missing canonical Journal migration ${segment.productionFile}`);
    }
    const expectedName = `${segment.productionVersion}_${segment.uuid}.sql`;
    if (segment.productionFile !== expectedName) {
      throw new Error(
        `UUID filename mismatch for ${segment.kind}: ${segment.productionFile} vs ${expectedName}`,
      );
    }
    const raw = readFileSync(path);
    const sql = toCanonicalSql(raw);
    const bytes = Buffer.byteLength(sql, "utf8");
    if (bytes !== segment.bytes) {
      throw new Error(
        `byte count changed for ${segment.productionFile}: expected ${segment.bytes}, got ${bytes}`,
      );
    }
    const digest = extractIntegrityDigest(sql);
    if (digest !== segment.digest) {
      throw new Error(
        `embedded digest changed for ${segment.productionFile}: expected ${segment.digest}, got ${digest}`,
      );
    }
    if (segment.bytes > SIZE_LIMIT) {
      throw new Error(`${segment.productionFile} is ${segment.bytes} bytes, exceeds ${SIZE_LIMIT}`);
    }
    const rel = `supabase/migrations/${segment.productionFile}`;
    const blob = gitHashObject(rel);
    if (segment.gitBlob && blob !== segment.gitBlob) {
      throw new Error(
        `git blob changed for ${segment.productionFile}: expected ${segment.gitBlob}, got ${blob}`,
      );
    }
  }

  if (integrityFiles) {
    if (integrityFiles.length !== 26) {
      throw new Error(`integrity manifest must list 26 files, got ${integrityFiles.length}`);
    }
    for (let i = 0; i < 26; i += 1) {
      const rec = integrityFiles[i];
      const segment = map.segments[i];
      if (
        rec.file !== segment.productionFile ||
        rec.bytes !== segment.bytes ||
        rec.digest !== segment.digest ||
        rec.kind !== segment.kind
      ) {
        throw new Error(
          `runner-integrity.json drifted from canonical map at ${segment.productionFile}`,
        );
      }
    }
  } else if (existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    verifyCanonicalMigrations({ integrityFiles: manifest.files });
    return map;
  }

  return map;
}

export function assertGeneratedMatchesMap(formerFile, digest) {
  const segment = segmentByFormer(formerFile);
  if (digest !== segment.digest) {
    throw new Error(
      `generated digest for ${formerFile} is ${digest}, canonical ${segment.productionFile} requires ${segment.digest}`,
    );
  }
  return segment;
}

export function canonicalRecord(formerFile, kind) {
  const segment = segmentByFormer(formerFile);
  if (kind && kind !== segment.kind) {
    throw new Error(`kind mismatch for ${formerFile}: ${kind} vs map ${segment.kind}`);
  }
  return {
    file: segment.productionFile,
    bytes: segment.bytes,
    digest: segment.digest,
    kind: segment.kind,
  };
}

export function writeIntegrityManifest({ files, replaced, policyManifestParts }) {
  verifyCanonicalMigrations({ integrityFiles: files });
  writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify(
      {
        sizeLimit: SIZE_LIMIT,
        replaced,
        files,
        policyManifestParts,
      },
      null,
      2,
    )}\n`,
  );
}
