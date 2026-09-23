import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  maxMigrationTimestamp,
  validateMigrationOrdering,
  validateNewMigrationFilename,
} from "../../../scripts/supabase/migration-order.mjs";

describe("supabase migration ordering", () => {
  it("passes for the canonical supabase/migrations tree", () => {
    const result = validateMigrationOrdering();
    expect(result.ok, result.errors.join("\n")).toBe(true);
    expect(result.maxTimestamp).toMatch(/^\d{14}$/);
  });

  it("fails when a new migration timestamp is not after the current max", () => {
    const max = maxMigrationTimestamp();
    expect(max).not.toBeNull();
    const bad = validateNewMigrationFilename(`${max}_too_old.sql`);
    expect(bad.ok).toBe(false);
  });

  it("passes when a new migration timestamp is after the current max", () => {
    const max = maxMigrationTimestamp();
    expect(max).not.toBeNull();
    const next = String(BigInt(max!) + 1n).padStart(14, "0");
    const good = validateNewMigrationFilename(`${next}_ok.sql`);
    expect(good.ok).toBe(true);
  });

  it("fails for non-monotonic ordering in a temp directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-order-"));
    try {
      fs.writeFileSync(path.join(dir, "20260101000000_a.sql"), "-- a");
      fs.writeFileSync(path.join(dir, "20260101000000_b.sql"), "-- dup");
      const dup = validateMigrationOrdering(dir);
      expect(dup.ok).toBe(false);
      expect(dup.errors.some((e) => e.includes("duplicate"))).toBe(true);

      fs.unlinkSync(path.join(dir, "20260101000000_b.sql"));
      fs.writeFileSync(path.join(dir, "20260101000000_c.sql"), "-- dup prefix");
      const dup2 = validateMigrationOrdering(dir);
      expect(dup2.ok).toBe(false);
      expect(dup2.errors.some((e) => e.includes("duplicate"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
