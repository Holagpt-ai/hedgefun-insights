import { ToolGrid } from "@/components/home/ToolGrid";

/** V21 wrapper — reuses existing route/auth wiring from ToolGrid. */
export function FeatureGridV21() {
  return (
    <section aria-labelledby="hp-tools-heading" className="hp-card p-4">
      <h2 id="hp-tools-heading" className="mb-3 text-base font-extrabold">
        Tools
      </h2>
      <div className="homepage-v21-tools">
        <ToolGrid />
      </div>
    </section>
  );
}