import { MessageSquare, Info, Sparkles } from "lucide-react";
import CommunityRulesCard from "@/components/community/CommunityRulesCard";
import CommunityWaitlistForm from "@/components/community/CommunityWaitlistForm";
import {
  COMMUNITY_COPY, COMMUNITY_PREVIEW_SECTIONS,
} from "@/config/community.config";

export default function CommunityWaitlistPage() {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <MessageSquare className="h-5 w-5 text-accent-blue" />
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">
            {COMMUNITY_COPY.title}
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-blue-light text-accent-blue">
            {COMMUNITY_COPY.badge}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          {COMMUNITY_COPY.subtitle}
        </p>
      </div>

      {/* Trust banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 px-3.5 py-3">
        <Info className="h-4 w-4 text-accent-blue shrink-0 mt-0.5" />
        <div className="text-xs text-foreground leading-relaxed">
          {COMMUNITY_COPY.trustBanner}
        </div>
      </div>

      {/* Waitlist + Rules — two column on md */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CommunityWaitlistForm />
        <CommunityRulesCard />
      </div>

      {/* Preview sections */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-accent-blue" />
          <h2 className="text-sm font-semibold text-foreground">What Community will include</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COMMUNITY_PREVIEW_SECTIONS.map((section) => (
            <div
              key={section.title}
              className="relative rounded-lg border border-dashed border-border bg-surface-card p-4"
              aria-label={`${section.title} — coming soon preview`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {section.description}
              </p>
              <div className="mt-3 pt-3 border-t border-dashed border-border text-[11px] text-muted-foreground italic">
                Preview only — no live posts yet.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer disclaimer */}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        {COMMUNITY_COPY.footerDisclaimer}
      </p>
    </div>
  );
}
