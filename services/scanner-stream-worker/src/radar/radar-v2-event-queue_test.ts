import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createRadarV2EventPublishQueue,
  RADAR_V2_MAX_EVENTS_PER_PUBLISH,
} from "./radar-v2-event-queue.ts";
import type { RadarV22EventRow } from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DATE = "2026-08-10";

function ev(i: number): RadarV22EventRow {
  return {
    trading_date: DATE,
    session_kind: "market",
    symbol: "AAA",
    event_type: "DETECTED",
    event_at: new Date(Date.parse("2026-08-10T14:00:00.000Z") + i * 1000).toISOString(),
    generation_id: GEN,
  };
}

Deno.test("queues overflow and flushes losslessly across cycles", () => {
  const queue = createRadarV2EventPublishQueue();
  const incoming = Array.from({ length: 300 }, (_, i) => ev(i));
  queue.stageIncoming(incoming);
  assertEquals(queue.pendingCount(), 300);

  const batch1 = queue.nextBatch();
  assertEquals(batch1.length, RADAR_V2_MAX_EVENTS_PER_PUBLISH);
  queue.confirmPersisted(batch1);
  assertEquals(queue.pendingCount(), 44);

  const batch2 = queue.nextBatch();
  assertEquals(batch2.length, 44);
  queue.confirmPersisted(batch2);
  assertEquals(queue.pendingCount(), 0);
});

Deno.test("failed batch is not confirmed and remains pending", () => {
  const queue = createRadarV2EventPublishQueue();
  queue.stageIncoming(Array.from({ length: 300 }, (_, i) => ev(i)));
  const batch = queue.nextBatch();
  assertEquals(batch.length, RADAR_V2_MAX_EVENTS_PER_PUBLISH);
  assertEquals(queue.pendingCount(), 300);
});

Deno.test("duplicate event keys collapse to one pending row", () => {
  const queue = createRadarV2EventPublishQueue();
  const row = ev(1);
  queue.stageIncoming([row, { ...row }]);
  assertEquals(queue.pendingCount(), 1);
});
