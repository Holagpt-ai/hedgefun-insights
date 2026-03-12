import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import PublicLayout from "@/layouts/PublicLayout";
import AdminLayout from "@/layouts/AdminLayout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import StockDetail from "./pages/stocks/StockDetail";
import Screener from "./pages/Screener";
import MoversPage from "./pages/movers/MoversPage";
import { RecentIposPage, UpcomingIposPage } from "./pages/ipos/IpoPages";
import IpoStatisticsPage from "./pages/ipos/IpoStatisticsPage";
import IpoNewsPage from "./pages/ipos/IpoNewsPage";
import IpoScreenerPage from "./pages/ipos/IpoScreenerPage";
import EarningsPage from "./pages/earnings/EarningsPage";
import WatchlistPage from "./pages/watchlist/WatchlistPage";
import ProPage from "./pages/pro/ProPage";
import AccountPage from "./pages/account/AccountPage";
import NewsPage from "./pages/news/NewsPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminSubscriptionsPage from "./pages/admin/AdminSubscriptionsPage";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import AdminNewsPage from "./pages/admin/AdminNewsPage";
import AdminMarketPage from "./pages/admin/AdminMarketPage";
import AdminSeoPage from "./pages/admin/AdminSeoPage";
import AdminAlertsPage from "./pages/admin/AdminAlertsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import StubPage from "./pages/stubs/StubPage";
import StockExchangesPage from "./pages/stocks/StockExchangesPage";
import StockComparePage from "./pages/stocks/StockComparePage";
import IndustryPage from "./pages/stocks/IndustryPage";
import StockListsPage from "./pages/stocks/StockListsPage";
import TopAnalystsPage from "./pages/stocks/TopAnalystsPage";
import TopStocksPage from "./pages/stocks/TopStocksPage";
import CorporateActionsPage from "./pages/stocks/CorporateActionsPage";
import EtfScreenerPage from "./pages/etf/EtfScreenerPage";
import EtfComparePage from "./pages/etf/EtfComparePage";
import EtfNewLaunchesPage from "./pages/etf/EtfNewLaunchesPage";
import EtfProvidersPage from "./pages/etf/EtfProvidersPage";
import TrendingPage from "./pages/trending/TrendingPage";
import ChartPage from "./pages/chart/ChartPage";
import GainersPage from "./pages/markets/GainersPage";
import LosersPage from "./pages/markets/LosersPage";
import ActivePage from "./pages/markets/ActivePage";
import PremarketPage from "./pages/markets/PremarketPage";
import AfterHoursPage from "./pages/markets/AfterHoursPage";
import HeatmapPage from "./pages/markets/HeatmapPage";
import NewsletterPage from "./pages/newsletter/NewsletterPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/stocks/:ticker" element={<StockDetail />} />
                  <Route path="/screener" element={<Screener />} />
                  <Route path="/movers/:type" element={<MoversPage />} />
                  <Route path="/movers" element={<MoversPage />} />
                  <Route path="/ipos/recent" element={<RecentIposPage />} />
                  <Route path="/ipos/calendar" element={<UpcomingIposPage />} />
                  <Route path="/ipos/statistics" element={<IpoStatisticsPage />} />
                  <Route path="/ipos/news" element={<IpoNewsPage />} />
                  <Route path="/ipos/screener" element={<IpoScreenerPage />} />
                  <Route path="/ipos/upcoming" element={<UpcomingIposPage />} />
                  <Route path="/ipos" element={<RecentIposPage />} />
                  <Route path="/earnings" element={<EarningsPage />} />
                  <Route path="/watchlist" element={<WatchlistPage />} />
                  <Route path="/pro" element={<ProPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/news" element={<NewsPage />} />
                  <Route path="/stocks/exchanges" element={<StockExchangesPage />} />
                  <Route path="/stocks/compare" element={<StockComparePage />} />
                  <Route path="/stocks/industry" element={<IndustryPage />} />
                  <Route path="/stocks/lists" element={<StockListsPage />} />
                  <Route path="/stocks/analysts" element={<TopAnalystsPage />} />
                  <Route path="/stocks/top-stocks" element={<TopStocksPage />} />
                  <Route path="/stocks/corporate-actions" element={<CorporateActionsPage />} />

                  {/* Stub pages */}
                  <Route path="/dividends" element={<StubPage title="Dividend Tracker" description="Track dividend yields, payout dates, and dividend history for any stock." />} />
                  <Route path="/splits" element={<StubPage title="Stock Split History" description="View historical and upcoming stock splits across all exchanges." />} />
                  <Route path="/etfs" element={<StubPage title="ETF Explorer" description="Discover, compare, and screen thousands of ETFs by category and performance." />} />
                  <Route path="/etf/screener" element={<EtfScreenerPage />} />
                  <Route path="/etf/compare" element={<EtfComparePage />} />
                  <Route path="/etf/list/new" element={<EtfNewLaunchesPage />} />
                  <Route path="/etf/provider" element={<EtfProvidersPage />} />
                  <Route path="/etfs/top" element={<StubPage title="Top ETFs" description="The highest-performing ETFs ranked by returns, volume, and assets under management." />} />
                  <Route path="/etfs/compare" element={<StubPage title="ETF Comparison" description="Side-by-side comparison of up to 4 ETFs across all key metrics." />} />
                  <Route path="/trending" element={<TrendingPage />} />
                  <Route path="/markets/gainers" element={<GainersPage />} />
                  <Route path="/markets/losers" element={<LosersPage />} />
                  <Route path="/markets/active" element={<ActivePage />} />
                  <Route path="/markets/premarket" element={<PremarketPage />} />
                  <Route path="/markets/after-hours" element={<AfterHoursPage />} />
                  <Route path="/markets/heatmap" element={<HeatmapPage />} />
                  <Route path="/articles" element={<StubPage title="Market Articles" description="In-depth analysis, commentary, and research from the HedgeFun team." />} />
                  <Route path="/chart" element={<StubPage title="Technical Chart" description="Advanced charting with technical indicators, drawing tools, and multiple timeframes." />} />
                  
                  <Route path="/tools" element={<StubPage title="Investor Tools" description="A collection of calculators, converters, and analysis tools for every investor." />} />
                  <Route path="/ipos/spac" element={<StubPage title="SPAC List" description="Track all active SPACs, their targets, and merger status." />} />
                  <Route path="/download" element={<StubPage title="Download HedgeFun" description="HedgeFun mobile app — coming soon to iOS and Android." />} />
                </Route>

                {/* Chart routes — standalone layout */}
                <Route path="/chart" element={<ChartPage />} />
                <Route path="/chart/:ticker" element={<ChartPage />} />

                {/* Newsletter — standalone layout */}
                <Route path="/newsletter" element={<NewsletterPage />} />

                {/* Admin routes */}
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
                  <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
                  <Route path="/admin/news" element={<AdminNewsPage />} />
                  <Route path="/admin/market" element={<AdminMarketPage />} />
                  <Route path="/admin/seo" element={<AdminSeoPage />} />
                  <Route path="/admin/alerts" element={<AdminAlertsPage />} />
                  <Route path="/admin/settings" element={<AdminSettingsPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
