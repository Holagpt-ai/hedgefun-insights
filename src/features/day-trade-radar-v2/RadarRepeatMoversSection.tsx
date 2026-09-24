import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import type { RadarRepeatMoverFilterId } from "@/config/radar-repeat-movers.config";
import type { RepeatMoversLoadState } from "@/lib/radar/repeat-movers-load-state";
import { RepeatMoversView } from "./RepeatMoversView";

class RepeatMoversRenderBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function UnavailablePanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
      data-testid="repeat-movers-unavailable"
    >
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-3 text-[12px] font-semibold text-accent-blue hover:underline"
          onClick={onRetry}
        >
          Retry Repeat Movers
        </button>
      ) : null}
    </div>
  );
}

export function RadarRepeatMoversSection({
  loadState,
  onRetry,
  onOpenDetails,
}: {
  loadState: RepeatMoversLoadState;
  onRetry?: () => void;
  onOpenDetails: (symbol: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<RadarRepeatMoverFilterId>("all");
  const [renderFailed, setRenderFailed] = useState(false);

  if (loadState.status === "idle" || loadState.status === "loading") {
    return (
      <section className="min-w-0 space-y-2" data-testid="repeat-movers-section">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Repeat Movers
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {loadState.status === "loading" ? "Loading repeat mover history…" : "Repeat Movers pending board data."}
        </div>
      </section>
    );
  }

  if (renderFailed || loadState.status === "error") {
    return (
      <section className="min-w-0 space-y-2" data-testid="repeat-movers-section">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Repeat Movers
        </div>
        <UnavailablePanel
          message="Repeat Movers is temporarily unavailable. Discovery and other Radar panels remain live."
          onRetry={onRetry}
        />
      </section>
    );
  }

  if (loadState.status === "unavailable") {
    const message = loadState.reason === "no_session"
      ? "Sign in to load Repeat Movers history."
      : "Repeat Movers history is temporarily unavailable.";
    return (
      <section className="min-w-0 space-y-2" data-testid="repeat-movers-section">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Repeat Movers
        </div>
        <UnavailablePanel message={message} onRetry={onRetry} />
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-2" data-testid="repeat-movers-section">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Repeat Movers
      </div>
      <RepeatMoversRenderBoundary
        onError={() => setRenderFailed(true)}
        fallback={(
          <UnavailablePanel
            message="Repeat Movers could not render safely. Discovery and other Radar panels remain live."
            onRetry={() => {
              setRenderFailed(false);
              onRetry?.();
            }}
          />
        )}
      >
        <RepeatMoversView
          view={loadState.view}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onOpenDetails={onOpenDetails}
        />
      </RepeatMoversRenderBoundary>
    </section>
  );
}
