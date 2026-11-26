import { CALENDAR_V4_LEGEND, type CalendarV4LegendCategory } from "@/config/calendar-v4";
import { chipClassForCategory } from "@/components/calendar-v4/category-chip-class";
import { cn } from "@/lib/utils";

interface Props {
  hidden: ReadonlySet<CalendarV4LegendCategory>;
  onToggle: (id: CalendarV4LegendCategory) => void;
}

export function CalendarLegend({ hidden, onToggle }: Props) {
  return (
    <div className="cal-legend-row" aria-label="Event type legend">
      <span className="cal-legend-label">LEGEND</span>
      {CALENDAR_V4_LEGEND.map((item) => {
        const off = hidden.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={cn("cal-legend-chip", off && "off")}
            aria-pressed={!off}
            onClick={() => onToggle(item.id)}
          >
            <i className={chipClassForCategory(item.id)} aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}