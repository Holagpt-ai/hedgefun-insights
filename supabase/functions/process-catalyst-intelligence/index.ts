// process-catalyst-intelligence — Catalyst Intelligence V1B shadow processor.
// Server only. Bearer SYNC_SECRET. OPTIONS + POST only.
// Default mode dry_run. Write requires CATALYST_INTELLIGENCE_WRITE_ENABLED=true.
// Reads catalyst_events. Never writes catalyst_events. No cron. No delivery.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_LIMIT, HARD_MAX_LIMIT } from "../_shared/catalyst-intelligence/activation.ts";
import type { IntelligenceSelection } from "../_shared/catalyst-intelligence/activation.ts";
import type { ProcessorStore } from "../_shared/catalyst-intelligence/processor.ts";
import type { CatalystEventRow } from "../_shared/catalyst-intelligence/select.ts";
import { applySelection } from "../_shared/catalyst-intelligence/select.ts";
import { handleProcessCatalystIntelligence } from "./handler.ts";

type SbClient = ReturnType<typeof createClient<any, "public", any>>;

const SELECT_COLUMNS =
  "id,dedupe_key,symbol,company_name,event_type,verification_state,event_date,event_time,time_of_day,title,description,source_name,source_url,provider,provider_article_id,related_symbols,facts,published_at,created_at";

function asRow(raw: Record<string, unknown>): CatalystEventRow | null {
  if (typeof raw.id !== "string" || typeof raw.dedupe_key !== "string") return null;
  if (typeof raw.symbol !== "string" || typeof raw.event_type !== "string") return null;
  if (typeof raw.title !== "string" || typeof raw.provider !== "string") return null;
  if (typeof raw.source_name !== "string" || typeof raw.event_date !== "string") return null;
  return {
    id: raw.id,
    dedupe_key: raw.dedupe_key,
    symbol: raw.symbol,
    company_name: typeof raw.company_name === "string" ? raw.company_name : null,
    event_type: raw.event_type,
    verification_state: typeof raw.verification_state === "string" ? raw.verification_state : null,
    event_date: raw.event_date,
    event_time: typeof raw.event_time === "string" ? raw.event_time : null,
    time_of_day: typeof raw.time_of_day === "string" ? raw.time_of_day : null,
    title: raw.title,
    description: typeof raw.description === "string" ? raw.description : null,
    source_name: raw.source_name,
    source_url: typeof raw.source_url === "string" ? raw.source_url : null,
    provider: raw.provider,
    provider_article_id: typeof raw.provider_article_id === "string" ? raw.provider_article_id : null,
    related_symbols: Array.isArray(raw.related_symbols) ? raw.related_symbols as string[] : [],
    facts: raw.facts && typeof raw.facts === "object" && !Array.isArray(raw.facts)
      ? raw.facts as Record<string, unknown>
      : {},
    published_at: typeof raw.published_at === "string" ? raw.published_at : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
  };
}

function createSupabaseStore(supabase: SbClient): ProcessorStore {
  return {
    async loadCatalystEvents(selection: IntelligenceSelection) {
      const fetchLimit = Math.min(Math.max(selection.limit, 1), HARD_MAX_LIMIT);
      let query = supabase
        .from("catalyst_events")
        .select(SELECT_COLUMNS)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(Math.min(fetchLimit * 4, HARD_MAX_LIMIT));

      if (selection.catalyst_event_id) {
        query = query.eq("id", selection.catalyst_event_id);
      }
      if (selection.provider) {
        query = query.eq("provider", selection.provider);
      }
      if (selection.symbols && selection.symbols.length > 0) {
        query = query.in("symbol", selection.symbols);
      }
      if (selection.since) {
        query = query.gte("published_at", selection.since);
      }

      const { data, error } = await query;
      if (error) return null;
      const mapped = ((data ?? []) as Record<string, unknown>[])
        .map(asRow)
        .filter((r): r is CatalystEventRow => r !== null);
      return applySelection(mapped, { ...selection, limit: fetchLimit || DEFAULT_LIMIT });
    },
    async findIntelligenceIdentity(sourceEventId, rulesVersion) {
      const { data, error } = await supabase
        .from("catalyst_intelligence")
        .select("id")
        .eq("source_event_id", sourceEventId)
        .eq("rules_version", rulesVersion)
        .maybeSingle();
      if (error) return null;
      return Boolean(data);
    },
    async insertIntelligence(row) {
      const { data, error } = await supabase
        .from("catalyst_intelligence")
        .insert(row)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return { ok: false, duplicate: true };
        return { ok: false, duplicate: false };
      }
      if (!data || typeof (data as { id?: unknown }).id !== "string") {
        return { ok: false, duplicate: false };
      }
      return { ok: true, id: (data as { id: string }).id };
    },
    async findAlertDedupe(dedupeKey) {
      const { data, error } = await supabase
        .from("alert_events")
        .select("id")
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();
      if (error) return null;
      return Boolean(data);
    },
    async insertAlert(row, intelligenceId) {
      const { error } = await supabase.from("alert_events").insert({
        ...row,
        intelligence_id: intelligenceId,
      });
      if (error) {
        if (error.code === "23505") return { ok: false, duplicate: true };
        return { ok: false, duplicate: false };
      }
      return { ok: true };
    },
  };
}

serve(async (req) => {
  const env = (key: string) => Deno.env.get(key);
  const supabaseUrl = env("SUPABASE_URL") ?? "";
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const store = supabaseUrl && serviceRole
    ? createSupabaseStore(createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    }))
    : {
      loadCatalystEvents: async () => null,
      findIntelligenceIdentity: async () => null,
      insertIntelligence: async () => ({ ok: false as const, duplicate: false }),
      findAlertDedupe: async () => null,
      insertAlert: async () => ({ ok: false as const, duplicate: false }),
    };

  return await handleProcessCatalystIntelligence(req, { env, store });
});
