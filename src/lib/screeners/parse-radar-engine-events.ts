/** Parses persisted radar_engine_events (string or { type } objects). */

export function parseRadarEngineEventTypes(events: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(events)) return out;
  for (const item of events) {
    if (typeof item === "string" && item.trim()) {
      out.add(item.trim().toUpperCase());
      continue;
    }
    if (item && typeof item === "object" && "type" in item) {
      const type = (item as { type?: unknown }).type;
      if (typeof type === "string" && type.trim()) {
        out.add(type.trim().toUpperCase());
      }
    }
  }
  return out;
}
