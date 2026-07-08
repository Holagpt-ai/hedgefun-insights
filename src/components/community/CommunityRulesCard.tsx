import { ShieldCheck } from "lucide-react";
import { COMMUNITY_RULES } from "@/config/community.config";

export default function CommunityRulesCard() {
  return (
    <div className="rounded-lg border border-border bg-surface-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-accent-blue" />
        <h2 className="text-sm font-semibold text-foreground">Community rules (preview)</h2>
      </div>
      <ul className="space-y-2">
        {COMMUNITY_RULES.map((rule) => (
          <li key={rule} className="flex items-start gap-2 text-sm text-foreground">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent-blue shrink-0"
            />
            <span className="leading-snug">{rule}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground mt-3">
        These rules will apply when Community launches. They may be updated before release.
      </p>
    </div>
  );
}
