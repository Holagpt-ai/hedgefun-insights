import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JOURNAL_PAGE_MAP } from "../page-map";
import { JOURNAL_NAV, journalNavPaths } from "../nav";

describe("journal navigation", () => {
  it("maps every JOURNAL_NAV destination to a page", () => {
    for (const path of journalNavPaths()) {
      expect(JOURNAL_PAGE_MAP[path as keyof typeof JOURNAL_PAGE_MAP], path).toBeTruthy();
    }
  });

  it("renders JOURNAL_NAV destinations", () => {
    const { getAllByRole } = render(
      <nav>
        {JOURNAL_NAV.flatMap((group) =>
          group.items.map((item) => (
            <a key={item.path} href={item.path}>{item.id}</a>
          )),
        )}
      </nav>,
    );
    expect(getAllByRole("link").length).toBe(journalNavPaths().length);
  });
});
