export function CalendarPowerSection() {
  return (
    <section className="cal-power" aria-labelledby="cal-power-title">
      <h2 id="cal-power-title">How Stocksist powers this calendar</h2>
      <ul>
        <li>
          <b>Catalyst events</b> — verified SEC EDGAR, earnings providers, and news wires via Supabase ingestion
          (never invented headlines or dates).
        </li>
        <li>
          <b>Quotes & charts</b> — delayed market data through the Stocksist market-data edge function (Massive /
          Polygon entitlements).
        </li>
        <li>
          <b>Macro releases</b> — Finnhub economic calendar sync into `economic_events` when authorized in
          production (actual, consensus, and previous values only when reported by the provider).
        </li>
        <li>
          <b>AI context</b> — cached watchlist analysis where available; live AI Analyst runs only when you open the
          analyst workspace.
        </li>
      </ul>
    </section>
  );
}