import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";

describe("TopNReveal", () => {
  it("shows Top 3 by default and expands/collapses with accurate counts", () => {
    render(
      <TopNReveal items={["one", "two", "three", "four", "five"]}>
        {(visible) => (
          <ul>
            {visible.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </TopNReveal>,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("four")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View All (5)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("five")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show Less" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "View All (5)" })).toBeTruthy();
  });

  it("hides the toggle when there are 3 or fewer items", () => {
    render(
      <TopNReveal items={["a", "b", "c"]}>
        {(visible) => (
          <ul>
            {visible.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </TopNReveal>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders nothing extra for an empty list", () => {
    render(
      <TopNReveal items={[]}>
        {(visible) => (visible.length === 0 ? <p>empty</p> : null)}
      </TopNReveal>,
    );
    expect(screen.getByText("empty")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
