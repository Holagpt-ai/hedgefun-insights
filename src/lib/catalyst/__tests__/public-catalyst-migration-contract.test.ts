import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "supabase/migrations");

describe("public catalyst migration contract", () => {
  it("revokes anon catalyst_events SELECT", () => {
    const sql = readFileSync(
      resolve(root, "20261126220000_catalyst_events_public_calendar_read_v1.sql"),
      "utf8",
    );
    expect(sql).toContain("REVOKE SELECT ON public.catalyst_events FROM anon");
    expect(sql).not.toMatch(/GRANT SELECT ON public\.catalyst_events TO anon/i);
  });

  it("paginated RPC returns coverage metadata and status projection", () => {
    const sql = readFileSync(
      resolve(root, "20261126240000_public_catalyst_calendar_pagination_v1.sql"),
      "utf8",
    );
    expect(sql).toContain("coverage_incomplete");
    expect(sql).toContain("event_status");
    expect(sql).toContain("impact_level");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.public_catalyst_calendar_range_v1");
    expect(sql).toContain("ORDER BY ce.event_date ASC, ce.event_time ASC NULLS LAST, ce.title ASC, ce.id ASC");
  });
});