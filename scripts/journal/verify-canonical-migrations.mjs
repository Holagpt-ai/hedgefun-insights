import { verifyCanonicalMigrations } from "./canonical.mjs";

const map = verifyCanonicalMigrations();
console.log(
  `canonical Journal sequence ok: ${map.segments.length} production files, 0 executable 20260816191* duplicates`,
);
