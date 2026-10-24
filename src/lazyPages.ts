import { lazy } from "react";

/** Dashboard / trader surfaces (Momentum Radar, catalyst, AI). */
export const LazyScreeners = lazy(() => import("@/pages/dashboard/Screeners"));
export const LazyAIAnalyst = lazy(() => import("@/pages/dashboard/AIAnalyst"));
export const LazyCatalyst = lazy(() => import("@/pages/dashboard/Catalyst"));
export const LazyActionCenter = lazy(() => import("@/pages/dashboard/ActionCenter"));
export const LazyAMInbox = lazy(() => import("@/pages/dashboard/AMInbox"));
export const LazyPMInbox = lazy(() => import("@/pages/dashboard/PMInbox"));

/** Journal is a large subtree — load on demand. */
export const LazyJournalShell = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.JournalShell };
});
export const LazyJournalOverview = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.OverviewPage };
});
export const LazyJournalOnboarding = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.OnboardingPage };
});
export const LazyJournalCalendar = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.CalendarPage };
});
export const LazyJournalDailyReview = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.DailyReviewPage };
});
export const LazyJournalTrades = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.TradesPage };
});
export const LazyJournalNewTrade = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.NewTradePage };
});
export const LazyJournalTradeDetail = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.TradeDetailPage };
});
export const LazyJournalNotebook = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.NotebookPage };
});
export const LazyJournalNotebookEntry = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.NotebookEntryPage };
});
export const LazyJournalPlaybooks = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.PlaybooksPage };
});
export const LazyJournalPlaybookDetail = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.PlaybookDetailPage };
});
export const LazyJournalReports = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.ReportsPage };
});
export const LazyJournalReportBuilder = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.ReportBuilderPage };
});
export const LazyJournalSavedReport = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.SavedReportPage };
});
export const LazyJournalReportSchedule = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.ReportSchedulePage };
});
export const LazyJournalAnalytics = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.AnalyticsPage };
});
export const LazyJournalCoach = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.CoachPage };
});
export const LazyJournalSettings = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.SettingsPage };
});
export const LazyJournalLegacyRedirect = lazy(async () => {
  const mod = await import("@/journal");
  return { default: mod.JournalLegacyRedirect };
});

/** Admin console. */
export const LazyAdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
export const LazyAdminUsers = lazy(() => import("@/pages/admin/AdminUsersPage"));
export const LazyAdminSubscriptions = lazy(() => import("@/pages/admin/AdminSubscriptionsPage"));
export const LazyAdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalyticsPage"));
export const LazyAdminNews = lazy(() => import("@/pages/admin/AdminNewsPage"));
export const LazyAdminMarket = lazy(() => import("@/pages/admin/AdminMarketPage"));
export const LazyAdminSeo = lazy(() => import("@/pages/admin/AdminSeoPage"));
export const LazyAdminAlerts = lazy(() => import("@/pages/admin/AdminAlertsPage"));
export const LazyAdminSettings = lazy(() => import("@/pages/admin/AdminSettingsPage"));

/** Charting and heatmap (heavy chart libraries). */
export const LazyChartPage = lazy(() => import("@/pages/chart/ChartPage"));
export const LazyHeatmapPage = lazy(() => import("@/pages/markets/HeatmapPage"));
