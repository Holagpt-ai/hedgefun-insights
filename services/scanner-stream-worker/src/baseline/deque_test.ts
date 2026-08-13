import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MonotonicMaxDeque, MonotonicMinDeque } from "./deque.ts";

Deno.test("exact deque high and low over ascending dates", () => {
  const maxQ = new MonotonicMaxDeque();
  const minQ = new MonotonicMinDeque();
  const rows: Array<{ d: string; h: number; l: number }> = [
    { d: "2026-01-02", h: 10, l: 5 },
    { d: "2026-01-05", h: 12, l: 6 },
    { d: "2026-01-06", h: 11, l: 4 },
    { d: "2026-01-07", h: 9, l: 7 },
  ];
  for (const row of rows) {
    maxQ.push(row.d, row.h);
    minQ.push(row.d, row.l);
    maxQ.expire("2026-01-02");
    minQ.expire("2026-01-02");
  }

  assertEquals(maxQ.front(), { d: "2026-01-05", v: 12 });
  assertEquals(minQ.front(), { d: "2026-01-06", v: 4 });
  assertEquals(maxQ.toArray(), [
    { d: "2026-01-05", v: 12 },
    { d: "2026-01-06", v: 11 },
    { d: "2026-01-07", v: 9 },
  ]);
  assertEquals(minQ.toArray(), [
    { d: "2026-01-06", v: 4 },
    { d: "2026-01-07", v: 7 },
  ]);
});

Deno.test("equal high replaces older candidate; expire drops fronts before period_start", () => {
  const maxQ = new MonotonicMaxDeque();
  maxQ.push("2026-01-02", 10);
  maxQ.push("2026-01-05", 10);
  assertEquals(maxQ.front(), { d: "2026-01-05", v: 10 });
  assertEquals(maxQ.toArray(), [{ d: "2026-01-05", v: 10 }]);

  maxQ.push("2026-01-06", 8);
  maxQ.expire("2026-01-06");
  assertEquals(maxQ.front(), { d: "2026-01-06", v: 8 });
  assertEquals(maxQ.toArray(), [{ d: "2026-01-06", v: 8 }]);
});

Deno.test("equal low replaces older candidate", () => {
  const minQ = new MonotonicMinDeque();
  minQ.push("2026-01-02", 4);
  minQ.push("2026-01-05", 4);
  assertEquals(minQ.front(), { d: "2026-01-05", v: 4 });
  minQ.push("2026-01-06", 6);
  assertEquals(minQ.toArray(), [
    { d: "2026-01-05", v: 4 },
    { d: "2026-01-06", v: 6 },
  ]);
});
