import type { EconomicEventUpsertRow } from "./finnhub-economic-calendar.ts";

export type EconomicEventsUpsertResult = {
  upserted: number;
  batches: number;
  failedBatches: number;
};

export async function upsertEconomicEventBatches(input: {
  supabase: {
    from: (table: string) => {
      upsert: (
        rows: (EconomicEventUpsertRow & { fetched_at: string })[],
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  rows: readonly EconomicEventUpsertRow[];
  fetchedAt: string;
  batchSize?: number;
}): Promise<EconomicEventsUpsertResult> {
  const batchSize = input.batchSize ?? 40;
  if (input.rows.length === 0) {
    return { upserted: 0, batches: 0, failedBatches: 0 };
  }

  let upserted = 0;
  let batches = 0;
  let failedBatches = 0;

  for (let i = 0; i < input.rows.length; i += batchSize) {
    batches += 1;
    const slice = input.rows.slice(i, i + batchSize).map((row) => ({
      ...row,
      fetched_at: input.fetchedAt,
    }));
    const { error } = await input.supabase
      .from("economic_events")
      .upsert(slice, { onConflict: "dedupe_key" });
    if (error) {
      failedBatches += 1;
      throw new Error(error.message);
    }
    upserted += slice.length;
  }

  return { upserted, batches, failedBatches };
}