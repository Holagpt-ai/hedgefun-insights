import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateTrades, calculateTrade, dailyMetrics } from "../calc";
import { AUGUST_14_TRADES, AUGUST_DEMO_TRADES, DEMO_ACCOUNTS, DEMO_MISSING_REVIEWS, DEMO_WORKSPACE_LABEL } from "../demo/august-fixtures";
import { JOURNAL_BASE } from "../nav";
import { NotebookEntryPage } from "./NotebookEntryPage";
import { NotebookPage } from "./NotebookPage";
import { SettingsPage } from "./SettingsPage";
import { TradeNotesPanel } from "../components/TradeNotesPanel";
import { TradeDetailPage } from "./TradeDetailPage";

const { workspaceMock, AUTH_USER, serviceMocks } = vi.hoisted(() => ({
  AUTH_USER: { id: "11111111-1111-4111-8111-0000000000aa" },
  workspaceMock: { current: {} as Record<string, unknown> },
  serviceMocks: {
    listNotebookEntries: vi.fn(),
    saveNotebookEntry: vi.fn(),
    getNotebookEntry: vi.fn(),
    deleteNotebookEntry: vi.fn(),
    listNotebookAttachments: vi.fn(),
    listTradeNotes: vi.fn(),
    saveTradeNote: vi.fn(),
    deleteTradeNote: vi.fn(),
    listNoteAttachments: vi.fn(),
    deleteOwnedTrade: vi.fn(),
    deleteOwnedAccount: vi.fn(),
  },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: AUTH_USER }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("../workspace/JournalWorkspace", () => ({
  useJournalWorkspace: () => workspaceMock.current,
}));

vi.mock("../lib/notebook-service", () => ({
  listNotebookEntries: (...args: unknown[]) => serviceMocks.listNotebookEntries(...args),
  saveNotebookEntry: (...args: unknown[]) => serviceMocks.saveNotebookEntry(...args),
  getNotebookEntry: (...args: unknown[]) => serviceMocks.getNotebookEntry(...args),
  deleteNotebookEntry: (...args: unknown[]) => serviceMocks.deleteNotebookEntry(...args),
}));

vi.mock("../lib/attachments-service", () => ({
  listNotebookAttachments: (...args: unknown[]) => serviceMocks.listNotebookAttachments(...args),
  listNoteAttachments: (...args: unknown[]) => serviceMocks.listNoteAttachments(...args),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  createAttachmentSignedUrl: vi.fn(),
}));

vi.mock("../lib/notes-service", () => ({
  listTradeNotes: (...args: unknown[]) => serviceMocks.listTradeNotes(...args),
  saveTradeNote: (...args: unknown[]) => serviceMocks.saveTradeNote(...args),
  deleteTradeNote: (...args: unknown[]) => serviceMocks.deleteTradeNote(...args),
}));

vi.mock("../lib/delete-owned", () => ({
  deleteOwnedTrade: (...args: unknown[]) => serviceMocks.deleteOwnedTrade(...args),
  deleteOwnedAccount: (...args: unknown[]) => serviceMocks.deleteOwnedAccount(...args),
}));

function demoWorkspace() {
  const trades = AUGUST_DEMO_TRADES;
  return {
    mode: "demo",
    loading: false,
    error: null,
    allTrades: trades,
    trades,
    calculations: trades.map(calculateTrade),
    metrics: aggregateTrades(trades),
    daily: dailyMetrics(trades),
    selectedAccountId: "all",
    range: "augustDemo",
    asset: "all",
    setAccountId: () => {},
    setRange: () => {},
    setAsset: () => {},
    accounts: DEMO_ACCOUNTS,
    dataQualityCount: 0,
    dataQualityIssues: [],
    hideDemo: () => {},
    showDemo: () => {},
    demoHidden: false,
    refresh: vi.fn(async () => {}),
    onLiveTradeSaved: async () => {},
    processScore: 78,
    equity: 54150n * 1_000_000n,
    reconciliationState: {
      derivedEquity: 0n,
      reportedBalance: null,
      difference: null,
      state: "missing_balance" as const,
    },
    missingReviews: DEMO_MISSING_REVIEWS,
    demoLabel: DEMO_WORKSPACE_LABEL,
  };
}

function liveWorkspace() {
  const nvda = {
    ...AUGUST_14_TRADES.find((trade) => trade.id === "demo-nvda")!,
    id: "048ab0ed-0b50-4814-8c5f-36e3068520e3",
    accountId: "44444444-4444-4444-8444-0000000000dd",
  };
  return {
    ...demoWorkspace(),
    mode: "live",
    allTrades: [nvda],
    trades: [nvda],
    accounts: [{
      id: "44444444-4444-4444-8444-0000000000dd",
      name: "Schwab",
      type: "personal",
      baseCurrency: "USD",
      beginningBalance: 0,
      reportedBalance: 0,
      reportedAsOf: "2026-08-22",
    }],
  };
}

beforeEach(() => {
  for (const mock of Object.values(serviceMocks)) mock.mockReset();
  serviceMocks.listNotebookEntries.mockResolvedValue({ ok: true, entries: [] });
  serviceMocks.listNotebookAttachments.mockResolvedValue({ ok: true, attachments: [] });
  serviceMocks.listNoteAttachments.mockResolvedValue({ ok: true, attachments: [] });
  serviceMocks.listTradeNotes.mockResolvedValue({ ok: true, notes: [] });
  serviceMocks.getNotebookEntry.mockResolvedValue({ ok: false, error: "not_found" });
});

describe("notebook UI smoke closure", () => {
  it("opens a new editor without creating a row", async () => {
    workspaceMock.current = liveWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/notebook`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/notebook`} element={<NotebookPage />} />
          <Route path={`${JOURNAL_BASE}/notebook/new`} element={<NotebookEntryPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(serviceMocks.listNotebookEntries).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "New entry" }));
    expect(await screen.findByText("Save entry")).toBeInTheDocument();
    expect(serviceMocks.saveNotebookEntry).not.toHaveBeenCalled();
  });

  it("disables save while submitting and ignores a second click", async () => {
    workspaceMock.current = liveWorkspace();
    let resolveSave: (value: unknown) => void = () => {};
    serviceMocks.saveNotebookEntry.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/notebook/new`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/notebook/new`} element={<NotebookEntryPage />} />
          <Route path={`${JOURNAL_BASE}/notebook/:entryId`} element={<NotebookEntryPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lesson" } });
    const save = screen.getByRole("button", { name: "Save entry" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(serviceMocks.saveNotebookEntry).toHaveBeenCalledTimes(1);
    resolveSave({
      ok: true,
      entry: {
        id: "77777777-7777-4777-8777-000000000077",
        notebookId: "88888888-8888-4888-8888-000000000088",
        title: "Lesson",
        body: "",
        entryDate: "2026-08-22",
        createdAt: "2026-08-22T00:00:00Z",
        updatedAt: "2026-08-22T00:00:00Z",
        tradeIds: [],
      },
    });
    await waitFor(() => expect(serviceMocks.saveNotebookEntry).toHaveBeenCalledTimes(1));
  });

  it("keeps demo notebook read-only with no writes", () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter>
        <NotebookPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "New entry" })).toBeDisabled();
    expect(serviceMocks.listNotebookEntries).not.toHaveBeenCalled();
    expect(serviceMocks.saveNotebookEntry).not.toHaveBeenCalled();
  });
});

describe("trade notes and deletion UI", () => {
  it("keeps thesis separate and hides delete in demo", async () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/demo-nvda`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/trades/:tradeId`} element={<TradeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Delete trade" })).toBeNull();
    render(
      <TradeNotesPanel
        mode="demo"
        userId={AUTH_USER.id}
        client={{ from: vi.fn(), storage: { from: vi.fn() } } as never}
        tradeId="demo-nvda"
        thesis="Hold VWAP"
      />,
    );
    expect(screen.getByText("Trade thesis is stored on the Plan tab and is not a saved note.")).toBeInTheDocument();
    expect(screen.getByText("Hold VWAP")).toBeInTheDocument();
    expect(serviceMocks.saveTradeNote).not.toHaveBeenCalled();
    expect(serviceMocks.deleteOwnedTrade).not.toHaveBeenCalled();
  });

  it("creates and deletes a live trade note from the notes panel", async () => {
    const tradeId = "048ab0ed-0b50-4814-8c5f-36e3068520e3";
    const note = {
      id: "99999999-9999-4999-8999-000000000099",
      tradeId,
      body: "Held VWAP",
      noteType: "general",
      createdAt: "2026-08-22T00:00:00Z",
    };
    serviceMocks.saveTradeNote.mockResolvedValue({ ok: true, note });
    serviceMocks.deleteTradeNote.mockResolvedValue({ ok: true, note });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <TradeNotesPanel
        mode="live"
        userId={AUTH_USER.id}
        client={{ from: vi.fn(), storage: { from: vi.fn() } } as never}
        tradeId={tradeId}
        thesis="Plan thesis"
      />,
    );
    await waitFor(() => expect(serviceMocks.listTradeNotes).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox", { name: "Add note" }), { target: { value: "Held VWAP" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("button", { name: "Delete note" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(serviceMocks.deleteTradeNote).toHaveBeenCalled());
  });

  it("requires the symbol before deleting a live trade", async () => {
    workspaceMock.current = liveWorkspace();
    serviceMocks.deleteOwnedTrade.mockResolvedValue({ ok: true });
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/048ab0ed-0b50-4814-8c5f-36e3068520e3`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/trades/:tradeId`} element={<TradeDetailPage />} />
          <Route path={`${JOURNAL_BASE}/trades`} element={<div>trades-list</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete trade" }));
    const dialogConfirm = await screen.findByTestId("confirm-delete-trade");
    expect(dialogConfirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("confirm-trade-symbol"), { target: { value: "NVDA" } });
    await waitFor(() => expect(dialogConfirm).toBeEnabled());
    fireEvent.click(dialogConfirm);
    await waitFor(() => expect(serviceMocks.deleteOwnedTrade).toHaveBeenCalledTimes(1));
  });
});

describe("account deletion UI", () => {
  it("does not offer account deletion in demo", () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/settings?section=accounts`]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(serviceMocks.deleteOwnedAccount).not.toHaveBeenCalled();
  });
});
