# Radar historical context — Edge response ambiguity (Batch 28.3)

The `radar-historical-context` Edge function returns **HTTP 200** with `historicalContext: null` when:

- Per-request resolution or bridge work **times out**
- The **whole batch** exceeds `BATCH_TIMEOUT_MS`
- The bridge returns no context payload

It does **not** currently return a separate field that distinguishes **verified absence of history** from **unverified retrieval failure**.

Until a minimal server-side outcome field is added (recommended follow-up), the web client classifies null bodies as **`unavailable`**, not **`empty`**, and preserves any previously loaded rich context when a later batch fails.
