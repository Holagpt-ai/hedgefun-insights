import { assembleRepeatMoverContext } from "../_shared/repeat-movers/assemble-repeat-mover-context.ts";
import { enrichRepeatMoverComparableEpisodes } from "../_shared/repeat-movers/enrich-comparable-episodes.ts";
import type { RepeatMoverContextInput } from "../_shared/repeat-movers/types.ts";
import type { RadarBridgeAction } from "./actions.ts";
import { BEHAVIOR_PROFILE_SELECT, BEHAVIOR_PROFILE_TABLE } from "./behavior-handlers.ts";
import type { DbClient } from "./handler.ts";
import {
  DAILY_HISTORY_SELECT,
  DAILY_HISTORY_TABLE,
  EPISODE_SELECT,
  EPISODES_TABLE,
  HISTORICAL_PAGE_MAX,
  type HistoricalSelectQuery,
} from "./historical-handlers.ts";

function readUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchAllForSecurity(
  db: DbClient,
  table: string,
  select: string,
  securityId: string,
  orderCol: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const result = await (db.from(table).select(select) as unknown as HistoricalSelectQuery)
      .eq("security_id", securityId)
      .order(orderCol, { ascending: true })
      .range(offset, offset + HISTORICAL_PAGE_MAX - 1);
    if (result.error) throw new Error("persist_failed");
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < HISTORICAL_PAGE_MAX) break;
    offset += HISTORICAL_PAGE_MAX;
  }
  return rows;
}

function readCurrentContext(body: Record<string, unknown>): RepeatMoverContextInput | null {
  const raw = body.current_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as RepeatMoverContextInput;
}

export async function handleRepeatMoverAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
  rpc?: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  if (action !== "repeat_mover_get_context") return null;

  const securityId = readUuid(body.security_id);
  const currentContext = readCurrentContext(body);
  if (!securityId || !currentContext) {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  try {
    const profileResult = await (db.from(BEHAVIOR_PROFILE_TABLE)
      .select(BEHAVIOR_PROFILE_SELECT) as unknown as HistoricalSelectQuery)
      .eq("security_id", securityId)
      .maybeSingle();
    if (profileResult.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);

    const [dailyHistory, episodes] = await Promise.all([
      fetchAllForSecurity(db, DAILY_HISTORY_TABLE, DAILY_HISTORY_SELECT, securityId, "session_date"),
      fetchAllForSecurity(db, EPISODES_TABLE, EPISODE_SELECT, securityId, "episode_start"),
    ]);

    let context = assembleRepeatMoverContext({
      securityId,
      profileRow: profileResult.data ?? null,
      dailyHistory,
      episodes,
      currentContext,
      assembledAt: typeof body.assembled_at === "string" ? body.assembled_at : undefined,
    });

    if (rpc && context.comparableHistory.closestComparableEpisodes.length > 0) {
      const enriched = await enrichRepeatMoverComparableEpisodes({
        comparables: context.comparableHistory.closestComparableEpisodes,
        mostRecentComparableEpisode: context.comparableHistory.mostRecentComparableEpisode,
        rpc,
      });
      context = {
        ...context,
        comparableHistory: {
          ...context.comparableHistory,
          closestComparableEpisodes: enriched.closestComparableEpisodes,
          mostRecentComparableEpisode: enriched.mostRecentComparableEpisode,
        },
      };
    }

    return jsonResponse({ ok: true, context });
  } catch {
    return jsonResponse({ ok: false, error: "persist_failed" }, 502);
  }
}
