type Props = { setupTag: string | null };

const MAP: Record<string, { label: string; cls: string }> = {
  flat_top_breakout: { label: "Flat Top", cls: "bg-blue-500/15 text-blue-400" },
  bottom_bouncer: { label: "Bottom Bouncer", cls: "bg-purple-500/15 text-purple-400" },
  flat_base_breakout: { label: "Flat Base", cls: "bg-indigo-500/15 text-indigo-400" },
  breakout_pullback: { label: "Breakout/Pullback", cls: "bg-orange-500/15 text-orange-400" },
  other: { label: "Other", cls: "bg-zinc-500/15 text-zinc-400" },
};

export default function SetupTagBadge({ setupTag }: Props) {
  if (!setupTag) return null;
  const entry = MAP[setupTag] ?? MAP.other;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${entry.cls}`}>
      {entry.label}
    </span>
  );
}
