import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTION_PROJECT_REF } from "@/lib/persistence/production-database";

export function requireProductionSupabaseUrl(): string {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  if (!url) throw new Error("SUPABASE_URL is required");
  if (!url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(`SUPABASE_URL must target project ${PRODUCTION_PROJECT_REF}`);
  }
  return url;
}

export function requireProductionSupabaseServerKey(): string {
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? ""
  ).trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required");
  return key;
}

export function createProductionSupabaseClient(): SupabaseClient {
  return createClient(requireProductionSupabaseUrl(), requireProductionSupabaseServerKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function selectAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
