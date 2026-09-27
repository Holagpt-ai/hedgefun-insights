import { useAuth } from "@/contexts/AuthContext";
import { AiTraderWorkspace } from "@/features/ai-trader/AiTraderWorkspace";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";

export default function AiTraderPage() {
  const { profile } = useAuth();
  return <AiTraderWorkspace snapshot={AI_TRADER_SHELL_SNAPSHOT} plan={profile?.plan} />;
}
