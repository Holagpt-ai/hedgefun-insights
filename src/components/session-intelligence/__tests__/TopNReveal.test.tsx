import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";

const VIEW_ALL_CLASS = "mt-2 text-xs font-medium text-accent-blue hover:underline";

describe("TopNReveal default view-all", () => {
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

  it("preserves the original direct button and does not apply view-more chrome", () => {
    const { container } = render(
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

    const button = screen.getByRole("button", { name: "View All (5)" });
    expect(button.className).toBe(VIEW_ALL_CLASS);
    expect(button.className).not.toMatch(/min-h-8/);
    expect(button.parentElement).toBe(container.firstElementChild);
    expect(button.parentElement?.className).not.toMatch(/flex/);
    expect(screen.queryByText(/total/)).toBeNull();
    expect(screen.queryByRole("button", { name: /View \d+ more/i })).toBeNull();
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

describe("TopNReveal view-more", () => {
  it("shows remaining count, total, expands, and Show less collapses", () => {
    render(
      <TopNReveal items={["one", "two", "three", "four"]} mode="view-more">
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
    expect(screen.getByText("4 total")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View All (4)" })).toBeNull();

    const more = screen.getByRole("button", { name: /View 1 more/i });
    expect(more.className).toMatch(/min-h-8/);
    expect(more.parentElement?.className).toMatch(/flex/);

    fireEvent.click(more);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Show less/i })).toBeTruthy();
    expect(screen.getByText("4 total")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Show less/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /View 1 more/i })).toBeTruthy();
    expect(screen.getByText("4 total")).toBeTruthy();
  });
});
