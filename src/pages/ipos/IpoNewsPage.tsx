import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { IpoTabBar } from "@/components/ipos/IpoTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function IpoNewsPage() {
  const [visibleCount, setVisibleCount] = useState(20);

  const { data: newsItems, isLoading } = useQuery({
    queryKey: ["ipo-news-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .eq("category", "ipo")
        .order("published_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    },
  });

  const { data: sidebarNews } = useQuery({
    queryKey: ["ipo-news-sidebar-more"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .eq("category", "ipo")
        .order("published_at", { ascending: false })
        .range(5, 12);
      if (error) throw error;
      return data;
    },
  });

  const items = newsItems ?? [];
  const visible = items.slice(0, visibleCount);

  return (
    <div>
      <IpoTabBar />
      <div className="p-4">
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/ipos/recent">IPOs</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>News</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Main feed */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No IPO news available yet.</p>
            ) : (
              visible.map((item: any) => (
                <div key={item.id} className="flex gap-4 py-4 border-b border-border-subtle">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      style={{ width: 120, height: 80, objectFit: "cover" }}
                      className="shrink-0 rounded-md overflow-hidden bg-muted"
                      onError={(e) => {
                        const img = e.currentTarget;
                        const fallback = document.createElement("div");
                        fallback.className = "w-[120px] h-[80px] shrink-0 rounded-md overflow-hidden bg-muted";
                        img.replaceWith(fallback);
                      }}
                    />
                  ) : (
                    <div className="w-[120px] h-[80px] shrink-0 rounded-md overflow-hidden bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={item.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.9375rem] font-semibold text-accent-blue hover:underline leading-snug line-clamp-2"
                    >
                      {item.headline}
                    </a>
                    <div className="text-[0.8125rem] text-muted-foreground mt-1">
                      {item.source ?? "HedgeFun"} · {item.published_at ? timeAgo(item.published_at) : ""}
                    </div>
                  </div>
                </div>
              ))
            )}

            {visibleCount < items.length && (
              <div className="py-6 text-center">
                <Button variant="outline" onClick={() => setVisibleCount((c) => c + 20)}>
                  Load More
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-full md:w-[300px] shrink-0 space-y-4">
            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>

            <div className="border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-foreground mb-3">More IPO News</h2>
              {(sidebarNews ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No additional news.</p>
              ) : (sidebarNews ?? []).map((news, i) => (
                <div key={news.id} className={cn("py-2.5", i < (sidebarNews?.length ?? 0) - 1 && "border-b border-border-subtle")}>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {news.published_at ? timeAgo(news.published_at) : ""}
                  </div>
                  <a
                    href={news.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-blue hover:underline text-left leading-snug"
                  >
                    {news.headline}
                  </a>
                </div>
              ))}
            </div>

            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
