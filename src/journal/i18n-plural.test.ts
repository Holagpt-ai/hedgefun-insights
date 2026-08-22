import { describe, expect, it } from "vitest";
import { journalCount, journalMessage } from "./i18n";

describe("journal pluralization", () => {
  it("uses singular deviation copy for a count of 1", () => {
    expect(journalCount("en", "review.deviation", 1)).toBe("1 deviation");
    expect(journalCount("es", "review.deviation", 1)).toBe("1 desviación");
  });

  it("uses plural copy for other counts", () => {
    expect(journalCount("en", "review.deviation", 0)).toBe("0 deviations");
    expect(journalCount("en", "review.deviation", 2)).toBe("2 deviations");
    expect(journalCount("es", "review.deviation", 2)).toBe("2 desviaciones");
    expect(journalCount("en", "review.followed", 1)).toBe("1 followed");
    expect(journalCount("es", "review.followed", 1)).toBe("1 cumplida");
    expect(journalCount("es", "review.followed", 3)).toBe("3 cumplidas");
    expect(journalCount("en", "review.violated", 1)).toBe("1 violated");
    expect(journalCount("es", "review.violated", 0)).toBe("0 violadas");
  });

  it("does not leave the old always-plural English string as the 1-count form", () => {
    expect(journalCount("en", "review.deviation", 1)).not.toBe("1 deviations");
    expect(journalMessage("en", "review.deviation.one", { n: 1 })).toBe("1 deviation");
  });
});
