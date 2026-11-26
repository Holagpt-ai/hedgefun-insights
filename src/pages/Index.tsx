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
import { HomepageV21Ipos } from "@/components/home/v21/HomepageV21Ipos";
import { HomepageV21Footer } from "@/components/home/v21/HomepageV21Footer";
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

      <StockIndexCarousel />

      <div className="top-band">
        <div className="band-col band-col-left">
          <div className="band-moves min-w-0">
            <SignificantMarketMovesV21 />
          </div>
          <MarketMoversV21 />
        </div>
        <div className="band-col band-col-right">
          <div className="band-assets min-w-0">
            <MyAssetsRail />
          </div>
          <HomepageTradingCalendar />
        </div>
      </div>

      <FeatureGridV21 />

      <div className="layout-bottom hp-layout mt-[18px]">
        <div className="hp-rail stack">
          <MarketNewsV21 />
          <HomepageV21Ipos />
        </div>
        <div className="hp-rail stack">
          <TrendingNowRail />
          <AdvertisementSlot />
        </div>
      </div>

      <div className="mt-6 px-1">
        <Disclaimer />
      </div>

      <HomepageV21Footer />
    </div>
  );
};

export default Index;