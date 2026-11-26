import { CALENDAR_V4_LEGEND } from "@/config/calendar-v4";

export function CalendarLegend() {
  return (
    <div className="cal-legend" aria-label="Event type legend">
      {CALENDAR_V4_LEGEND.map((item) => (
        <span key={item.id}>
          <i className={item.chipClass} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}