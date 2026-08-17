import { Route } from "react-router-dom";
import { JournalShell } from "./components/JournalShell";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CoachPage } from "./pages/CoachPage";
import { DailyReviewPage } from "./pages/DailyReviewPage";
import { JournalLegacyRedirect } from "./pages/JournalLegacyRedirect";
import { NewTradePage } from "./pages/NewTradePage";
import { NotebookEntryPage } from "./pages/NotebookEntryPage";
import { NotebookPage } from "./pages/NotebookPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlaybookDetailPage } from "./pages/PlaybookDetailPage";
import { PlaybooksPage } from "./pages/PlaybooksPage";
import { ReportBuilderPage } from "./pages/ReportBuilderPage";
import { ReportSchedulePage } from "./pages/ReportSchedulePage";
import { ReportsPage } from "./pages/ReportsPage";
import { SavedReportPage } from "./pages/SavedReportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TradeDetailPage } from "./pages/TradeDetailPage";
import { TradesPage } from "./pages/TradesPage";

export const JOURNAL_PAGE_MAP = {
  "/dashboard/journal": OverviewPage,
  "/dashboard/journal/calendar": CalendarPage,
  "/dashboard/journal/daily-review": DailyReviewPage,
  "/dashboard/journal/trades": TradesPage,
  "/dashboard/journal/notebook": NotebookPage,
  "/dashboard/journal/playbooks": PlaybooksPage,
  "/dashboard/journal/reports": ReportsPage,
  "/dashboard/journal/analytics": AnalyticsPage,
  "/dashboard/journal/settings": SettingsPage,
  "/dashboard/journal/settings?section=ai-memory": SettingsPage,
  "/dashboard/journal/settings?section=data-quality": SettingsPage,
  "/dashboard/journal/settings?section=imports": SettingsPage,
  "/dashboard/journal/settings?section=accounts": SettingsPage,
  "/dashboard/journal/onboarding": OnboardingPage,
  "/dashboard/journal/trades/new": NewTradePage,
  "/dashboard/journal/coach": CoachPage,
} as const;

export function JournalRouteTree() {
  return (
    <>
      <Route path="/journal" element={<JournalLegacyRedirect />} />
      <Route path="/dashboard/journal" element={<JournalShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="daily-review" element={<DailyReviewPage />} />
        <Route path="daily-review/:date" element={<DailyReviewPage />} />
        <Route path="trades" element={<TradesPage />} />
        <Route path="trades/new" element={<NewTradePage />} />
        <Route path="trades/:tradeId" element={<TradeDetailPage />} />
        <Route path="notebook" element={<NotebookPage />} />
        <Route path="notebook/:entryId" element={<NotebookEntryPage />} />
        <Route path="playbooks" element={<PlaybooksPage />} />
        <Route path="playbooks/:playbookId" element={<PlaybookDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/new" element={<ReportBuilderPage />} />
        <Route path="reports/:reportId" element={<SavedReportPage />} />
        <Route path="reports/:reportId/schedule" element={<ReportSchedulePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="analytics/:analysisId" element={<AnalyticsPage />} />
        <Route path="coach" element={<CoachPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </>
  );
}
