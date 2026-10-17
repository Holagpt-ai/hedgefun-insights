import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_KEY, writeUserJson } from "../lib/storage";
import { JOURNAL_BASE } from "../nav";
import { NewTradePage } from "./NewTradePage";

const { authMock, workspaceMock } = vi.hoisted(() => ({
  authMock: { current: { user: { id: "user-a" } as { id: string } | null } },
  workspaceMock: {
    current: {
      mode: "live" as const,
      accounts: [{ id: "live-default", name: "Primary" }],
      onLiveTradeSaved: async () => {},
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock.current,
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("@/hooks/useEffectiveLanguage", () => ({
  useEffectiveLanguage: () => "en",
}));

vi.mock("../workspace/JournalWorkspace", () => ({
  useJournalWorkspace: () => workspaceMock.current,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

const draftPayload = (symbol: string) => ({
  symbol,
  assetClass: "stock",
  direction: "long",
  accountId: "live-default",
  playbookName: "",
  plannedEntry: "",
  plannedStop: "",
  plannedTarget: "",
  plannedSize: "",
  plannedRisk: "",
  thesis: "",
  strike: "",
  expiration: "",
  right: "call",
  executions: [],
});

describe("NewTradePage user-scoped drafts", () => {
  beforeEach(() => {
    window.localStorage.clear();
    writeUserJson(DRAFT_KEY, "user-a", draftPayload("AAA"));
    writeUserJson(DRAFT_KEY, "user-b", draftPayload("BBB"));
  });

  it("does not overwrite user B draft with user A draft on account switch", async () => {
    authMock.current = { user: { id: "user-a" } };
    const view = render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/new`]}>
        <NewTradePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("AAA");
    });

    authMock.current = { user: { id: "user-b" } };
    await act(async () => {
      view.rerender(
        <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/new`]}>
          <NewTradePage />
        </MemoryRouter>,
      );
    });

    await waitFor(() => {
      expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("BBB");
    });

    expect(JSON.parse(window.localStorage.getItem("stocksist-journal-trade-draft:user-b")!).symbol).toBe("BBB");

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("stocksist-journal-trade-draft:user-b")!).symbol).toBe("BBB");
    });
  });
});
