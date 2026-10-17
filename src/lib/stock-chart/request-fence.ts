/** Drop stale async responses after ticker/user changes. */
export function createRequestFence() {
  let generation = 0;
  return {
    bump(): number {
      generation += 1;
      return generation;
    },
    isCurrent(expected: number): boolean {
      return expected === generation;
    },
    current(): number {
      return generation;
    },
  };
}
