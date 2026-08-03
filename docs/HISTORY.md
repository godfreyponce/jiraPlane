# jiraPlane — Build History & Reference

*Archived from STATE.md on 2026-08-03, when the two-session ticket protocol was adopted
(ported from Kal). STATE.md is now a thin quick-resume snapshot; this file holds the
per-ticket build archive. The work queue lives in GitHub Issues. Entries are
reverse-chronological; each is written at owner-acceptance time in the accept docs commit.*

Pre-protocol specs live in the projects root (`~/Developer/docs/superpowers/specs/`):
the 2026-07-23 design spec and the 2026-08-01 UI-redesign spec + accepted prototype.
From #10 onward, specs and plans are repo-local under `docs/superpowers/`.

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
