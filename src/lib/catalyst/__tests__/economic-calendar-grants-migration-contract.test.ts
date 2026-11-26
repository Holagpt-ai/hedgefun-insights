import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "supabase/migrations");
const grantsSql = readFileSync(
  resolve(root, "20261126250000_economic_calendar_service_role_grants_v1.sql"),
  "utf8",
);

describe("economic calendar service_role grants migration contract", () => {
  it("grants service_role upsert privileges without DELETE", () => {
    expect(grantsSql).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.economic_events TO service_role/i,
    );
    expect(grantsSql).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.economic_sync_status TO service_role/i,
    );
    expect(grantsSql).not.toMatch(/GRANT DELETE ON public\.economic_events/i);
    expect(grantsSql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("preserves anon/authenticated read-only posture", () => {
    expect(grantsSql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.economic_events/i);
    expect(grantsSql).toMatch(/GRANT SELECT ON public\.economic_events TO anon, authenticated/i);
    expect(grantsSql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.economic_sync_status/i);
    expect(grantsSql).toMatch(/GRANT SELECT ON public\.economic_sync_status TO anon, authenticated/i);
  });
});