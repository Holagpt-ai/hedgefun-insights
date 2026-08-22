import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CoachPage } from "./pages/CoachPage";
import { DailyReviewPage } from "./pages/DailyReviewPage";
import { NewTradePage } from "./pages/NewTradePage";
import { NotebookPage } from "./pages/NotebookPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlaybooksPage } from "./pages/PlaybooksPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
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
