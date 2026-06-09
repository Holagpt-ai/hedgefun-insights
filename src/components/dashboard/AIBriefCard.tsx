import { useNavigate } from "react-router-dom";
import { AIBriefConfig } from "@/config/inbox.config";
import { estTime } from "@/lib/price-utils";

interface AIBriefCardProps {
  isPro: boolean;
  config: AIBriefConfig;
}

export function AIBriefCard({ isPro, config }: AIBriefCardProps) {
  const navigate = useNavigate();

  return (
    <div className="relative rounded-lg border border-border bg-card p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-wide">{config.aiCardTitle}</h3>
        {isPro && config.aiCardTimestampLabel && (
          <span className="text-[11px] text-muted-foreground">
            {config.aiCardTimestampLabel} {estTime()}
          </span>
        )}
      </div>

      <p
        className={`text-sm leading-relaxed text-foreground/80 ${
          !isPro ? "blur-sm select-none pointer-events-none" : ""
        }`}
      >
        {config.aiCardPlaceholderText}
      </p>

      {!isPro && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-[2px] p-6 text-center">
          <span className="text-2xl">✦</span>
          <h4 className="text-base font-semibold text-foreground">
            {config.aiCardGateHeading}
          </h4>
          <p className="text-xs text-muted-foreground max-w-md">
            {config.aiCardGateBody}
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
          >
            {config.upgradeCta}
          </button>
          {config.upgradeLink && (
            <button
              onClick={() => navigate("/pro")}
              className="text-[11px] text-accent-blue underline"
            >
              {config.upgradeLink}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
