import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportWizard } from "./ImportWizard";

const { workspaceMock, importMocks, AUTH_USER } = vi.hoisted(() => ({
  AUTH_USER: { id: "11111111-1111-4111-8111-0000000000aa" },
  workspaceMock: {
    current: {
      mode: "live" as "demo" | "live" | "empty",
      hideDemo: vi.fn(),
      refresh: vi.fn(async () => {}),
    },
  },
  importMocks: {
    runCsvImport: vi.fn(),
    loadRecentImportJobs: vi.fn(async () => []),
    rollbackImportJob: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: AUTH_USER }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("../workspace/JournalWorkspace", () => ({
  useJournalWorkspace: () => workspaceMock.current,
}));

vi.mock("../import/import-service", async () => {
  const actual = await vi.importActual<typeof import("../import/import-service")>("../import/import-service");
  return {
    ...actual,
    runCsvImport: importMocks.runCsvImport,
    loadRecentImportJobs: importMocks.loadRecentImportJobs,
    rollbackImportJob: importMocks.rollbackImportJob,
  };
});

const SAMPLE = `symbol,side,qty,entry_price,exit_price,entry_date,exit_date,commission,id
NVDA,long,100,118.4,122.88,2026-08-14,2026-08-14,8,nvda-csv
`;

async function uploadCsv() {
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  const file = { name: "trades.csv", text: async () => SAMPLE } as File;
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText("Confirm import")).toBeInTheDocument());
}

describe("ImportWizard truthfulness", () => {
  it("blocks confirmation in Demo Workspace and makes no import service calls", async () => {
    workspaceMock.current = {
      mode: "demo",
      hideDemo: vi.fn(),
      refresh: vi.fn(async () => {}),
    };
    importMocks.runCsvImport.mockClear();
    importMocks.loadRecentImportJobs.mockClear();
    render(<ImportWizard />);
    await uploadCsv();
    const confirm = screen.getByText("Confirm import");
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(importMocks.runCsvImport).not.toHaveBeenCalled();
    expect(importMocks.loadRecentImportJobs).not.toHaveBeenCalled();
    expect(workspaceMock.current.hideDemo).not.toHaveBeenCalled();
  });

  it("shows confirmed counts and hides demo only after imported_count > 0", async () => {
    workspaceMock.current = {
      mode: "live",
      hideDemo: vi.fn(),
      refresh: vi.fn(async () => {}),
    };
    importMocks.loadRecentImportJobs.mockResolvedValue([]);
    importMocks.runCsvImport.mockResolvedValue({
      ok: true,
      counts: { total_count: 12, imported_count: 8, failed_count: 1, invalid_count: 2, duplicate_count: 1 },
      shouldHideDemo: true,
      shouldRefresh: true,
      status: "completed_with_errors",
      jobId: "job-1",
    });
    render(<ImportWizard />);
    await uploadCsv();
    fireEvent.click(screen.getByText("Confirm import"));
    await waitFor(() => expect(screen.getByTestId("import-message").textContent).toBe("8 trades imported. 2 invalid rows. 1 duplicate. 1 failed."));
    expect(screen.getByTestId("import-message").textContent).not.toBe("12 trades imported");
    expect(workspaceMock.current.hideDemo).toHaveBeenCalledTimes(1);
    expect(workspaceMock.current.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not hide Demo Workspace or refresh when zero rows persist", async () => {
    workspaceMock.current = {
      mode: "live",
      hideDemo: vi.fn(),
      refresh: vi.fn(async () => {}),
    };
    importMocks.loadRecentImportJobs.mockResolvedValue([]);
    importMocks.runCsvImport.mockResolvedValue({
      ok: true,
      counts: { total_count: 3, imported_count: 0, failed_count: 0, invalid_count: 3, duplicate_count: 0 },
      shouldHideDemo: false,
      shouldRefresh: false,
      status: "completed_with_errors",
      jobId: "job-2",
    });
    render(<ImportWizard />);
    await uploadCsv();
    fireEvent.click(screen.getByText("Confirm import"));
    await waitFor(() => expect(screen.getByTestId("import-message").textContent).toBe("0 trades imported. 3 invalid rows. 0 duplicate. 0 failed."));
    expect(workspaceMock.current.hideDemo).not.toHaveBeenCalled();
    expect(workspaceMock.current.refresh).not.toHaveBeenCalled();
  });

  it("does not report success when import is unconfirmed", async () => {
    workspaceMock.current = {
      mode: "live",
      hideDemo: vi.fn(),
      refresh: vi.fn(async () => {}),
    };
    importMocks.loadRecentImportJobs.mockResolvedValue([]);
    importMocks.runCsvImport.mockResolvedValue({
      ok: false,
      error: "Import was not confirmed.",
      counts: { total_count: 0, imported_count: 0, failed_count: 0, invalid_count: 0, duplicate_count: 0 },
      shouldHideDemo: false,
      shouldRefresh: false,
    });
    render(<ImportWizard />);
    await uploadCsv();
    fireEvent.click(screen.getByText("Confirm import"));
    await waitFor(() => expect(screen.getByTestId("import-message").textContent).toBe("Import was not confirmed."));
    expect(workspaceMock.current.hideDemo).not.toHaveBeenCalled();
    expect(workspaceMock.current.refresh).not.toHaveBeenCalled();
  });

  it("shows rollback success only after the RPC confirms trades removed", async () => {
    workspaceMock.current = {
      mode: "live",
      hideDemo: vi.fn(),
      refresh: vi.fn(async () => {}),
    };
    importMocks.loadRecentImportJobs.mockResolvedValue([
      {
        id: "job-live",
        source: "csv",
        filename: "trades.csv",
        status: "completed",
        created_at: "2026-08-18T00:00:00.000Z",
        started_at: null,
        finished_at: null,
        total_count: 2,
        imported_count: 2,
        failed_count: 0,
        invalid_count: 0,
        duplicate_count: 0,
      },
    ]);
    importMocks.rollbackImportJob.mockResolvedValue({
      ok: true,
      tradesDeleted: 2,
      shouldRefresh: true,
      jobId: "job-live",
    });
    render(<ImportWizard />);
    await waitFor(() => expect(screen.getByText("Rollback")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Rollback"));
    await waitFor(() => expect(screen.getByTestId("import-message").textContent).toBe("2 imported trades removed."));
    expect(workspaceMock.current.refresh).toHaveBeenCalled();
  });
});
