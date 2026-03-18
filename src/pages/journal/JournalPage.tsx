import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Tags, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useJournalTrades } from "@/hooks/useJournalTrades";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { TradeLogTable } from "@/components/journal/TradeLogTable";
import { JournalAnalytics } from "@/components/journal/JournalAnalytics";
import { JournalCalendar } from "@/components/journal/JournalCalendar";
import { AddTradeDialog } from "@/components/journal/AddTradeDialog";
import { ManageTagsDialog } from "@/components/journal/ManageTagsDialog";
import { AdBanner } from "@/components/layout/AdBanner";
import { cn } from "@/lib/utils";

const TABS = ["Trade Log", "Analytics"] as const;

export default function JournalPage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const isPro = profile?.plan === "pro" || profile?.plan === "unlimited";
  const [tab, setTab] = useState<string>("Trade Log");
  const [addOpen, setAddOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // If not logged in or not pro, show gate
  if (!authLoading && (!user || !isPro)) {
    return (
      <div className="p-4">
        <div className="max-w-md mx-auto text-center py-20">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent">
            <Lock className="h-7 w-7 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Stock Journal</h1>
          <p className="text-muted-foreground mb-6">
            The Stock Journal is a Pro feature. Upgrade to log trades, track performance, and discover your edge.
          </p>
          <Button onClick={() => navigate("/pro")} className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">
            Upgrade to Pro →
          </Button>
        </div>
      </div>
    );
  }

  return <JournalContent tab={tab} setTab={setTab} addOpen={addOpen} setAddOpen={setAddOpen} tagsOpen={tagsOpen} setTagsOpen={setTagsOpen} />;
}

function JournalContent({ tab, setTab, addOpen, setAddOpen, tagsOpen, setTagsOpen }: {
  tab: string; setTab: (t: string) => void;
  addOpen: boolean; setAddOpen: (v: boolean) => void;
  tagsOpen: boolean; setTagsOpen: (v: boolean) => void;
}) {
  const { trades, tags, tagAssignments, isLoading, addTrade, deleteTrade, addTag } = useJournalTrades();

  return (
    <div className="p-4">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Stock Journal</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-[1.75rem] font-bold text-foreground">Stock Journal</h1>
          <p className="text-sm text-muted-foreground">Log trades, track performance, and discover your edge.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setTagsOpen(true)}>
            <Tags className="h-3.5 w-3.5" /> Manage Tags
          </Button>
          <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground text-xs gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Log Trade
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-4">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium transition-colors relative", tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : tab === "Trade Log" ? (
        <TradeLogTable trades={trades} tags={tags} tagAssignments={tagAssignments} onDelete={(id) => deleteTrade.mutate(id)} />
      ) : (
        <JournalAnalytics trades={trades} tags={tags} tagAssignments={tagAssignments} />
      )}

      <AddTradeDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={(t) => { addTrade.mutate(t); setAddOpen(false); }} tags={tags} isPending={addTrade.isPending} />
      <ManageTagsDialog open={tagsOpen} onClose={() => setTagsOpen(false)} tags={tags} onAddTag={(name, color) => addTag.mutate({ name, color })} isPending={addTag.isPending} />

      <div className="mt-6">
        <AdBanner />
      </div>
    </div>
  );
}
