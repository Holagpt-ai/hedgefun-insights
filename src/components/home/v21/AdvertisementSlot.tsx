/** Reserved 336×280 placement — inactive, no ad scripts. */
export function AdvertisementSlot() {
  return (
    <aside aria-label="Advertising placement (inactive)" className="hp-ad-slot ad-slot rounded-[14px] border border-dashed border-[#bfcbd9] bg-[#edf1f6] p-3 text-center">
      <span className="ad-label mb-2 block text-[10.5px] font-bold uppercase tracking-widest text-[var(--hp-ink-3)]">
        Advertisement
      </span>
      <div className="ad-box flex min-h-[196px] flex-col items-center justify-center gap-1 rounded-lg border border-[var(--hp-line)] bg-[var(--hp-surface)] p-4 text-[var(--hp-ink-3)]">
        <span className="ad-size text-lg font-semibold text-[var(--hp-ink-2)]">336 × 280</span>
        <span className="ad-note text-xs font-semibold">Reserved · not activated</span>
      </div>
    </aside>
  );
}