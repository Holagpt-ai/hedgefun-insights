# Repeat Movers V2 UI

## Scope
- Add a compact `Radar` / `Repeat Movers` sub-view inside Day Trade Radar.
- Read the existing `repeatMoversView` from the screener result and keep its canonical Discovery-order `repeatMovers` list.
- Add the five requested compact filters; filtering never re-sorts candidates.
- Render desktop rows and stacked mobile cards with original Discovery rank, current metrics, limited evidence badges, two display facts, and existing workflow links.
- Keep the existing Radar board and Historical Behavior detail unchanged.

## Technical details
- Pass `repeatMoversView` through the existing screener hook and Day Trade Radar props.
- Add a focused Repeat Movers presentation component using existing tokens, buttons, badges, links, and formatting helpers.
- Exclude unavailable-history candidates by rendering only qualified `repeatMovers` and filtering that canonical list.
- Repair the carried-over chat typing error with a type-only compatibility change required for a clean build.

## Verification
- Add focused UI tests for sub-view switching, filters, badges/facts/actions, empty filtered state, and preserved Discovery order.
- Run the focused tests and verify the preview has no horizontal overflow at desktop and mobile widths.
