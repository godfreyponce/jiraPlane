# jiraPlane — Banner style picker (issue #10)

**Date:** 2026-08-03
**Status:** Approved by owner (approach A, as-is skywriter port)
**Depends on:** #4 (cargo-tag banner, accepted), #6 (multi-display flights, accepted)

## What this is

Let the user choose which banner style flies: the accepted cargo tag (default) or
Skywriter, smoke letters written along the flight path, ported from the round-1
prototype at `design-directions/4-skywriter.html` (git-ignored; the port brings the
visuals into the repo). The choice lives in the tray menu and persists across restarts.

Scope decisions made with the owner:

- Tray menu picker, persisted to disk. No `.env` knob, no restart required.
- Skywriter is an as-is port of the prototype's look. No polish round planned;
  feel iteration happens only if it bothers the owner during acceptance.
- All visuals stay in the single self-contained `plane.html` (standing project rule);
  the style arrives as a query param. No second HTML file.

## Settings persistence

New gitignored `settings.json` next to `state.json`:

```json
{ "bannerStyle": "cargo" }
```

- `main.js` reads it once at startup. Any failure (missing file, bad JSON, unknown
  value) falls back to `"cargo"`.
- The tray handler writes it synchronously on change.
- Add to `.gitignore`, and note in README/STATE gotchas that it is *not* `state.json`.
  Deleting dedup state must not lose the style choice; that is why the setting gets
  its own file.

## Tray picker

"Banner style" submenu in the existing tray menu, two radio items: Cargo tag and
Skywriter. Selecting one saves `settings.json` and rebuilds the menu (same pattern
as Pause/Resume polling). Applies to the next flight; "Test flight" respects it.

## main.js wiring

`createFlight` adds to the existing query string:

- `banner`: the chosen style.
- `textX0`, `textX1`: skywriter text bounds in global desktop px, computed from the
  primary display. Start 6% in, end at 88% of primary width (the prototype's layout
  budget). main.js computes these because plane.html only knows its own slice.

## plane.html: skywriter branch

One branch keyed on the `banner` param. Default and unknown values mean cargo.

Cargo path: untouched. Tag, rope, and pendulum sim stay exactly as accepted in #4.

Skywriter path:

- Tag and rope stay hidden; pendulum physics is skipped. The per-frame `flyY` re-pin
  loop remains (it serves the plane itself, not the tag).
- At launch, the banner text (same label/issueKey/snippet join contract) is laid out
  as fixed-position smoke puffs. The `.puff` styles port from the prototype: Arial
  Rounded 24px, white glow, blur-in/drift-up/dissipate keyframe shape.
  - Letter *i* sits at global `x = textX0 + i·spacing`, where
    `spacing = min(26px, (textX1 − textX0) / len)`.
  - It appears at the moment *t* the plane's tail crosses that x, inverted from the
    linear move animation (global span `minX − 194 → maxX + 400` over `dur`).
  - `y = flyY + 40 + 44·cos(2πt / (T/2))`, the same swoop sine, so letters sit on
    the actual flight path.
  - Global coords convert to local via `screenX`/`screenY`; each display's window
    renders only the letters on its own pixels. Puffs use the same
    paused-until-`body.fly` + `--sync-delay` launch mechanism as the rest of the rig.
- One deliberate deviation from the prototype: it looped, so puff lifetime never
  mattered. One-shot flights end, and main.js destroys the windows 1 s after. Each
  puff's animation is therefore scaled to finish by flight end: the prototype's
  keyframe shape compressed into `T − t`. Early letters linger (prototype feel), late
  letters dissipate quicker, and nothing pops off mid-fade at teardown.
- Standalone browser preview still works: no flight params means viewport-based
  layout (today's single-screen fallback); `?banner=skywriter` previews the new style.

Audio, flood valve, and digest handling are unchanged in both paths.

## Error handling

- Unreadable or invalid `settings.json`: cargo, app still runs.
- Unknown `banner` query value: cargo.
- Skywriter with empty text (can't happen with the current event contract, but):
  zero puffs, plane still flies.

## Verification

No test suite (project rule). Verify by running:

1. Test flight in both styles; the tray toggle applies without restart.
2. Both styles on single and dual display, AeroSpace running: skywriter letters land
   on the flight path on the correct screens, no seam artifacts.
3. Restart the app; the chosen style survives.
4. `plane.html?banner=skywriter&type=mention&issueKey=OPS-1&snippet=hello` in a plain
   browser for layout checks.

Acceptance = owner likes the flights.
