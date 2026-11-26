import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { marketPulseDelayDisclosure } from "@/lib/markets/market-pulse-select";
import { HOMEPAGE_V21_HEADLINE } from "@/config/homepage-v21";
import { GlobalMarketClocks } from "@/components/home/GlobalMarketClocks";
import Disclaimer from "@/components/layout/Disclaimer";
import { HomepageHeroV21 } from "@/components/home/v21/HomepageHeroV21";
import { StockIndexCarousel } from "@/components/home/v21/StockIndexCarousel";
import { SignificantMarketMovesV21 } from "@/components/home/v21/SignificantMarketMovesV21";
import { MarketMoversV21 } from "@/components/home/v21/MarketMoversV21";
import { MyAssetsRail } from "@/components/home/v21/MyAssetsRail";
import { HomepageTradingCalendar } from "@/components/home/v21/HomepageTradingCalendar";
import { FeatureGridV21 } from "@/components/home/v21/FeatureGridV21";
import { MarketNewsV21 } from "@/components/home/v21/MarketNewsV21";
import { TrendingNowRail } from "@/components/home/v21/TrendingNowRail";
import { AdvertisementSlot } from "@/components/home/v21/AdvertisementSlot";
import { QuietProRail } from "@/components/home/v21/QuietProRail";
import { HomepageV21Ipos } from "@/components/home/v21/HomepageV21Ipos";
import "@/components/home/v21/homepage-v21.css";

const Index = () => {
  usePageSeo({
    title: `${BRAND.name} — ${HOMEPAGE_V21_HEADLINE}`,
    description: `Discover session movers, research stocks, and continue into the Stocksist dashboard. ${marketPulseDelayDisclosure()}`,
    canonical: "/",
  });

  return (
    <div className="homepage-v21 mx-auto min-h-full w-full min-w-0 max-w-[1460px] px-3 py-4 sm:px-5 md:px-6">
      <div className="hidden" aria-hidden>
        <GlobalMarketClocks />
      </div>

      <HomepageHeroV21 />

      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-[18px] lg:items-start">
        <div className="min-w-0 lg:col-span-2">
          <StockIndexCarousel />
        </div>
        <div className="min-w-0">
          <SignificantMarketMovesV21 />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <MyAssetsRail />
        </div>
        <div className="min-w-0">
          <MarketMoversV21 />
        </div>
        <div className="min-w-0 lg:col-start-2">
          <HomepageTradingCalendar />
        </div>
        <div className="min-w-0">
          <FeatureGridV21 />
        </div>
        <div className="min-w-0">
          <MarketNewsV21 />
        </div>
        <div className="min-w-0 lg:col-start-2">
          <TrendingNowRail />
        </div>
        <div className="min-w-0 lg:col-span-1">
          <HomepageV21Ipos />
        </div>
        <div className="min-w-0 lg:col-start-2">
          <AdvertisementSlot />
        </div>
        <div className="min-w-0 lg:col-start-2">
          <QuietProRail />
        </div>
      </div>

      <div className="mt-6 px-1">
        <Disclaimer />
      </div>
    </div>
  );
};

export default Index;