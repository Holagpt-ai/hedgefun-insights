/** Shared PostgREST column list for client catalyst event reads (includes facts for verification hydration). */
export const CATALYST_EVENT_SELECT_FIELDS =
  "id, dedupe_key, symbol, company_name, event_type, verification_state, event_date, event_time, time_of_day, title, description, source_name, source_url, provider, related_symbols, facts, published_at";
