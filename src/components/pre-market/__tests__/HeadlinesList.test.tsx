import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadlinesList } from "@/components/pre-market/HeadlinesList";
import { FEED_SYNC_UNAVAILABLE } from "@/lib/pre-market/headlines";

describe("HeadlinesList", () => {
  it("discloses missing feed synchronization instead of implying freshness", () => {
    render(
      <HeadlinesList
        feedSyncAt={null}
        rows={[
          {
            id: "1",
            headline: "Fed holds rates steady",
            source: "Reuters",
            url: "https://example.com/fed",
            published_at: "2026-08-27T11:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText(FEED_SYNC_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByText(/published/)).toBeTruthy();
    expect(screen.queryByText(/Feed synchronized/)).toBeNull();
  });
});
