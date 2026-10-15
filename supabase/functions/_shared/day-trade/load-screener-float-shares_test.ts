import { assertEquals } from "jsr:@std/assert@1";
import {
  loadLatestScreenerFloatSharesBySymbol,
  SCREENER_FLOAT_SYMBOL_CHUNK_SIZE,
} from "./load-screener-float-shares.ts";
import type { QualificationDb } from "./persist-qualification-lifecycle.ts";

Deno.test("loadLatestScreenerFloatSharesBySymbol picks newest provider_as_of per symbol", async () => {
  const calls: string[][] = [];
  const db = {
    rpc: async () => ({ data: null, error: null }),
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: (_col: string, values: string[]) => {
          calls.push([...values]);
          return {
            not: () => ({
              order: () => ({
                limit: async () => ({
                  data: values.flatMap((symbol) => [
                    {
                      symbol,
                      float_shares: 10_000_000,
                      provider_as_of: "2026-10-14T10:00:00.000Z",
                    },
                    {
                      symbol,
                      float_shares: 20_000_000,
                      provider_as_of: "2026-10-15T10:00:00.000Z",
                    },
                  ]),
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
    }),
  } as unknown as QualificationDb;

  const out = await loadLatestScreenerFloatSharesBySymbol(db, ["aaa", "bbb"]);
  assertEquals(out.get("AAA"), 20_000_000);
  assertEquals(out.get("BBB"), 20_000_000);
  assertEquals(calls.length, 1);
});

Deno.test("loadLatestScreenerFloatSharesBySymbol chunks large symbol lists", async () => {
  const symbols = Array.from({ length: SCREENER_FLOAT_SYMBOL_CHUNK_SIZE + 5 }, (_, i) =>
    `S${i}`
  );
  let chunkCount = 0;
  const db = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        in: () => ({
          not: () => ({
            order: () => ({
              limit: async () => {
                chunkCount += 1;
                return { data: [], error: null };
              },
            }),
          }),
        }),
      }),
    }),
  } as unknown as QualificationDb;

  await loadLatestScreenerFloatSharesBySymbol(db, symbols);
  assertEquals(chunkCount, 2);
});
