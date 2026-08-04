# jiraPlane — Build History & Reference

*Archived from STATE.md on 2026-08-03, when the two-session ticket protocol was adopted
(ported from Kal). STATE.md is now a thin quick-resume snapshot; this file holds the
per-ticket build archive. The work queue lives in GitHub Issues. Entries are
reverse-chronological; each is written at owner-acceptance time in the accept docs commit.*

Pre-protocol specs live in the projects root (`~/Developer/docs/superpowers/specs/`):
the 2026-07-23 design spec and the 2026-08-01 UI-redesign spec + accepted prototype.
From #10 onward, specs and plans are repo-local under `docs/superpowers/`.

---

## Clickable cargo tag — #9 (2026-08-04) — ACCEPTED & CLOSED; commit a2935fd

Clicking the towed cargo tag mid-flight opens the ticket in the default browser; everywhere
else stays click-through the whole time. Overlay windows now use
`setIgnoreMouseEvents(true, { forward: true })` so the page receives mousemove while
click-through; a new 7-line sandboxed `preload.js` bridges two IPC calls (`tag-hot`,
`open-ticket`). The renderer hit-tests the last-known cursor against the tag rect + 24px
`HIT_PAD` **every sim frame** — not mouseenter/mouseleave, because the tag (~175px/s)
slides out from under a stationary cursor without ever firing leave, which would leave the
window click-blocking. Arming is per-window via the IPC sender (composes with #6's
one-overlay-per-display); `acceptFirstMouse: true` lets the first click reach the
never-focused window. Main derives `<baseUrl>/browse/<issueKey>` itself and opens only its
own `activeFlightUrl` — the renderer sends no payload. Digest flights (no issueKey),
skywriter, missing-`.env`, and standalone browser previews all fall out inert via one
`clickable` guard.

Owner decisions: generous hitbox over hover-slows-plane (option b would rework the #6
keyframe sync model — spun off as thinking behind #11); digest flights get no link. Gate-2
addition: hover "lift" (slab `scale` 1.07 + deeper shadow, 150ms) because macOS never
renders the CSS pointer cursor for this never-activated overlay — the standalone `scale`
property composes with the keyframed twist transform.

Verification: real-mouse pass by owner (hover, click → ticket opened, pass-through, feel);
agent pass via CDP synthetic input against the live overlay (arm → pointer style + hot
class, click → exactly one `/browse/PROJ-142` tab in the default browser, stationary-cursor
disarm, skywriter inert sweep, headless standalone check). CDP can't prove the OS-level
`forward: true` / `acceptFirstMouse` behavior — the owner's real mouse did.

---

## Banner style picker + Skywriter — #10 (2026-08-03) — ACCEPTED & CLOSED; commits 60854af, 62e45cb

Tray "Banner style" submenu (Cargo tag / Skywriter radios) persisted to a new gitignored
`settings.json` — deliberately separate from `state.json` so resetting dedup state keeps the
choice; any read failure falls back to cargo. `createFlight` passes `banner` plus skywriter
text bounds `textX0`/`textX1` (6%–88% of the primary display, global px) to the overlay.

Skywriter is an as-is port of the round-1 prototype (`design-directions/4-skywriter.html`):
each letter is a fixed-position smoke puff laid down at the point — and moment — the plane's
tail crosses its x, on the swoop sine, glowing then blurring/drifting up. Tag + rope hidden,
pendulum sim skipped (the per-frame `flyY` re-pin loop stays — it serves the plane). One
deviation from the prototype: puff animation duration is the REMAINING flight time, so
nothing pops off mid-fade at the 1s-after-flight window teardown. Cargo path byte-for-byte
untouched. Closed #5 (same work, pre-template).

Plan held with no deviations. Agent verification gap: the terminal lacked Screen Recording +
Accessibility permissions, so the tray-click write path and on-screen visuals were verified
by the owner at acceptance; the agent verified both styles standalone in Chrome (localhost
serve — the extension refuses file:// URLs), read/fallback paths of `settings.json`, and
clean app runs in both styles plus `MAX_EVENTS_PER_CYCLE=0`.

---

## Continuous multi-display flight — #6 (2026-08-03) — ACCEPTED & CLOSED; commit 9de6527

One overlay window per display, each rendering its slice of a single global flight path,
synced to a shared wall-clock start. Owner-verified on both monitors.

**Root cause was AeroSpace, not the tray path.** The tiling WM adopts each new overlay onto
the FOCUSED monitor's workspace and snaps back any app-side `setBounds`; no window style
escapes its 0.21.3 heuristics. The one working recipe: `releaseFromTilingWM()` moves each
overlay's node to its own monitor via the aerospace CLI after show. The earlier
"canJoinAllSpaces drags windows" diagnosis was wrong. `enableLargerThanScreen: true` kills
the separate macOS menu-bar-nudge constraint; plane.html's per-frame `flyY` re-pin covers
residual y offsets. Exit margin is 400px so the towed tag fully clears before teardown.
Full investigation log: issue #6.

---

## Cargo-tag pendulum banner — #4 (2026-08-02) — ACCEPTED & CLOSED; commit 94854a1

Banner became a cargo tag towed on a rigid-rope pendulum simulation: a distance constraint
(stretch-stopping, slack-allowing) with gravity + air drag, plus weathervane alignment.
Accepted feel: weight 670, drag 5.0, rope 64 — these values came out of the spec prototype's
feel sliders and the #4 round-2 comment; don't re-derive them. Old manila banner + ripple
filter removed. Skywriter option spun out to issue #5 (later #10).

---

## B2 paper glider redesign — #3 (2026-08-02) — ACCEPTED & CLOSED; commits 2bd8dec, 9b63399, 33e7200

Overlay visuals rebuilt around the B2 wide cream paper glider: move/swoop/bank rig,
speed-line streaks, airy whoosh audio. `main.js` webPreferences carries
`autoplayPolicy: 'no-user-gesture-required'` so overlay audio can autoplay. Spec + accepted
prototype: `~/Developer/docs/superpowers/specs/2026-08-01-jiraplane-ui-redesign-*`.

---

## Live polling — #2 (2026-07-31) — ACCEPTED

Polls Jira DC directly on a 60s cycle. Skips own-authored comments; the "reassigned away"
stream from JiraAlerts was deliberately NOT ported. Flood valve testable with
`MAX_EVENTS_PER_CYCLE=0 npm start`; plane.html's query contract includes `type=digest`
(digest banner is just the snippet, e.g. "7 Jira updates"). First poll cycle seeds silently;
reset `state.json` to re-trigger.

---

## Tray + overlay queue + plane.html — #1 — ACCEPTED

Menu-bar tray app, flight queue (one flight at a time), transparent click-through overlay
window, and the single self-contained `plane.html`. `TEST_FLIGHT=1 npm start` fires a
flight on launch.

---
