# jiraPlane — Flight display targeting (rows engine + fly-on setting)

**Date:** 2026-08-10
**Status:** Approved by owner (rows model, no side-by-side split toggle)
**Depends on:** #6 (multi-display flights, accepted), #10 (settings.json), #11/#15 (drag sim/scrub)
**Context:** first coworker ship surfaced a stacked (secondary-above-main) monitor
arrangement. Today's engine assumes one horizontal flight line, so stacked secondaries
silently get no plane, and their x-range can stretch the flight span into space that
exists on no display at `flyY` (late entry / early exit dead air on the main screen).

## What this is

Two things, one ticket:

1. A user setting — fly on **all displays** or **main display only**.
2. The engine change that makes "all displays" true on any arrangement: displays are
   grouped into horizontal **rows**, and each row gets one continuous flight.

## Scope decisions made with the owner

- **Rows model.** Displays whose y-ranges overlap form a row. One plane per row, flying
  continuously across everything in it. Side-by-side setups (the owner's): one row —
  behavior unchanged from #6. Stacked setups (the coworker's): two rows, one plane per
  monitor, sharing one wall-clock start.
- **No side-by-side split toggle.** The owner considered letting side-by-side users opt
  into one-plane-per-monitor; rejected — the modes only differ side-by-side, and the
  continuous flight is the accepted look. The only setting is all vs main.
- **Default `all`** — matches today's behavior on every setup that works today.
- **Interim control is a tray submenu** ("Fly on" → All displays / Main display), same
  radio pattern as the #10 banner picker. The settings window (separate ticket) absorbs
  it later.

## Setting

`settings.json` gains `"flyOn": "all" | "main"`. Missing/unknown value → `"all"`.
Same read-once-at-startup, write-on-change handling as `bannerStyle`.

## Rows engine (main.js)

`createFlight` currently computes one global `minX/maxX/flyY` over all displays. Instead:

- Partition `screen.getAllDisplays()` into rows by y-overlap (two displays share a row
  iff their `[y, y+height)` ranges intersect; union transitively).
- Per row: `minX/maxX` over that row's displays; `flyY` = 32% down the primary display
  if it's in the row (preserving today's exact line on the primary's row), else the
  row's tallest display; duration from the row's span at the shared `SPEED_PX_S`;
  each display's window gets its own row's params in the query string.
- All rows share one `start`. Teardown timer covers the longest row (+ the existing
  1s pad); the #15 `endAtMs` re-arm keeps working because it is renderer-reported.
- `flyOn: "main"`: one window on the primary display only, span = that display.
  This is also the sane fallback if row partitioning ever meets an arrangement it
  can't make sense of.

## Cross-window details (flagged in design, defaults not re-litigated)

- **Drag/state relay is scoped per row.** `flight-state` currently broadcasts to every
  window; with independent rows, grabbing the main-display plane must not warp the top
  monitor's plane. Relay only to windows in the sender's row. Same scoping for the
  any-hot `tag-hot` aggregation if it proves row-sensitive during planning.
- **Exactly one audio source overall** — the leftmost window of the primary's row —
  so stacked users don't get doubled sound.
- **Skywriter text bounds (`textX0/textX1`) computed per row**, so a second row gets
  text at all. How a side-by-side row's budget spreads across two displays stays
  issue #20's question; this ticket only moves the computation per-row.

## Interaction with open issues

- **#17** (duration scales with desktop width): rows shrink the problem for stacked
  setups (each row is one display wide → single-display duration) but the side-by-side
  long-flight question is untouched — still #17's.
- **#20** (skywriter bounds pinned to primary): partially addressed (per-row bounds);
  see above.
- **#21** (start lead races AeroSpace release) and **#22** (display snapshot vs
  sleep/wake): orthogonal; rows add windows but change neither race.

## Verification (no test suite — fly it)

- Side-by-side (owner's setup): test flight, confirm byte-for-byte today's look — one
  plane crossing the bezel, one audio source, drag still relays across the row.
- Stacked (simulate: arrange a display above the primary in System Settings, or
  standalone `plane.html?...` with stacked-geometry params): two synced planes, no
  dead air, dragging one leaves the other on script.
- `flyOn: "main"` on a multi-display setup: exactly one plane, primary only.
- Single display: unchanged in both modes.
