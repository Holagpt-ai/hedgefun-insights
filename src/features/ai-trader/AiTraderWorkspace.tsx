import { useState } from "react";
import { Bot } from "lucide-react";
import { hasProAccess } from "@/lib/entitlement";
import { AI_TRADER_WORKSPACE_TABS, type AiTraderWorkspaceTab } from "@/lib/ai-trader/contracts";
import {
  aiTraderModeLabel,
  aiTraderPerformanceLabel,
  isAiTraderRunningMode,
} from "@/lib/ai-trader/operating-mode";
import type { AiTraderShellSnapshot } from "@/lib/ai-trader/public-snapshot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function EmptyPanel({ copy }: { copy: string }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{copy}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-card px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export function AiTraderWorkspace({
  snapshot,
  plan,
}: {
  snapshot: AiTraderShellSnapshot;
  plan?: string | null;
}) {
  const [tab, setTab] = useState<AiTraderWorkspaceTab>("Live");
  const isPro = hasProAccess(plan);
  const unreported = "—";
  const trades = aiTraderPerformanceLabel(snapshot.operatingMode, snapshot.tradeCount);
  const positions = aiTraderPerformanceLabel(snapshot.operatingMode, snapshot.positions.length);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <Bot className="h-5 w-5 text-accent-blue" />
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">AI Trader</h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {aiTraderModeLabel(snapshot.operatingMode)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{snapshot.statusCopy}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="P&L" value={unreported} />
        <Metric label="Capital deployed" value={unreported} />
        <Metric label="Trades" value={trades} />
        <Metric label="Positions" value={positions} />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as AiTraderWorkspaceTab)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {AI_TRADER_WORKSPACE_TABS.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>

        {AI_TRADER_WORKSPACE_TABS.filter((name) => name !== "Research").map((name) => (
          <TabsContent key={name} value={name} className="mt-4">
            <EmptyPanel copy={snapshot.statusCopy} />
          </TabsContent>
        ))}

        <TabsContent value="Research" className="mt-4 space-y-2">
          <EmptyPanel copy={snapshot.statusCopy} />
          {!isPro && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pro includes AI Trader research.
              {isAiTraderRunningMode(snapshot.operatingMode)
                ? " No research has been recorded."
                : " Nothing is available to review while AI Trader is not active."}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
