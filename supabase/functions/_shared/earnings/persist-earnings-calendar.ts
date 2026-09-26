import type { EarningsCalendarUpsertRow } from "./finnhub-calendar.ts";

export type EarningsCalendarUpsertResult = {
  upserted: number;
  batches: number;
  failedBatches: number;
};

export async function upsertEarningsCalendarBatches(input: {
  supabase: {
    from: (table: string) => {
      upsert: (
        rows: EarningsCalendarUpsertRow[],
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  rows: readonly EarningsCalendarUpsertRow[];
  batchSize?: number;
}): Promise<EarningsCalendarUpsertResult> {
  const batchSize = input.batchSize ?? 50;
  if (input.rows.length === 0) {
    return { upserted: 0, batches: 0, failedBatches: 0 };
  }

  let upserted = 0;
  let batches = 0;
  let failedBatches = 0;

  for (let i = 0; i < input.rows.length; i += batchSize) {
    batches += 1;
    const batch = input.rows.slice(i, i + batchSize);
    const { error } = await input.supabase
      .from("earnings_calendar")
      .upsert(batch, { onConflict: "symbol,report_date" });
    if (error) {
      failedBatches += 1;
      throw new Error(error.message);
    }
    upserted += batch.length;
  }

  return { upserted, batches, failedBatches };
}
