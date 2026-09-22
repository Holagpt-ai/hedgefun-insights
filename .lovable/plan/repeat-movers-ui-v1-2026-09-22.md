# Repeat Movers UI V1

## Scope
- Add one compact historical badge beside each eligible Radar ticker, without adding columns or changing row sizing, order, or rank.
- Add a compact `Historical Behavior` section to the existing Radar ticker detail drawer.
- Render truthful empty and partial-history states; never substitute zero for unavailable values.
- Stack comparable episodes vertically on mobile with no horizontal overflow.

## Implementation
- Introduce small presentation helpers/components that read the existing `historicalContext` already attached to Radar rows.
- Show `X Similar Moves` when comparable episodes exist; otherwise show `Repeat Mover` only when the profile contains useful historical evidence.
- In details, show only sample quality, sessions observed, episode count, and up to three closest comparable episodes with available date, move, RVOL, tier, and next-session move.
- Reuse existing Stocksist tokens, typography, borders, and compact spacing.

## Verification
- Add focused UI tests for useful history, unavailable values, partial history, comparable episode limits, and unchanged rank/order.
- Check the preview at desktop and mobile widths and confirm no horizontal overflow.
