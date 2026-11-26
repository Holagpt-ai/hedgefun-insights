# Catalyst Calendar V4 — design package

## Approved references (not in repo locally)

The following Muse deliverables were **not found** in this workspace at implementation time:

- `stocksist-catalyst-calendar-mockup-v4.html`
- `stocksist-lovable-build-prompt-calendar-v4.pdf`

Integration contract and homepage handoff remain authoritative in:

- `docs/design/homepage-v21/stocksist-homepage-calendar-integration-blueprint.md`
- `docs/design/homepage-v21/stocksist-cursor-homepage-build-prompt.txt` (§ Calendar V4)

Copy these files into this folder when available; do **not** ship the standalone HTML as application code.

## Implementation note

Public route: `/calendar`. Visual system reuses Homepage V21 tokens (`--hp-*`, `hp-card`) and extends `calendar-v4.css` for the full layout (Month/List, filters, intelligence panels, chart popup).