import { BookOpen } from "lucide-react";

export default function EmptyJournalState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-full bg-surface-card border border-border flex items-center justify-center mb-4">
        <BookOpen className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        No trades logged yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Click "+ Log Trade" to record your first trade.
      </p>
    </div>
  );
}
