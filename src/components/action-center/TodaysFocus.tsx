import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { FocusTask } from "@/types/action-center";

export function TodaysFocus({ tasks }: { tasks: FocusTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        No pending workflow actions from current data.
      </div>
    );
  }
  return (
    <ul className="rounded-xl border bg-card divide-y">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link
            to={t.route}
            className="flex items-center gap-3 px-4 py-3 hover:bg-accent-blue-light/30 transition-colors"
          >
            <span className="mt-1 h-2 w-2 rounded-full bg-accent-blue shrink-0" />
            <span className="text-sm flex-1">{t.label}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground">
              {t.count}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
