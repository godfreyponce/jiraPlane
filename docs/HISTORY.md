# jiraPlane — Build History & Reference

*Archived from STATE.md on 2026-08-03, when the two-session ticket protocol was adopted
(ported from Kal). STATE.md is now a thin quick-resume snapshot; this file holds the
per-ticket build archive. The work queue lives in GitHub Issues. Entries are
reverse-chronological; each is written at owner-acceptance time in the accept docs commit.*

Pre-protocol specs live in the projects root (`~/Developer/docs/superpowers/specs/`):
the 2026-07-23 design spec and the 2026-08-01 UI-redesign spec + accepted prototype.
From #10 onward, specs and plans are repo-local under `docs/superpowers/`.

---

## Drag scrubs flight progress + three-grab fast exit — #15 (2026-08-04) — ACCEPTED & CLOSED; commits 3b08fcd..486a212

Releasing a dragged plane now re-seeds flight progress from the drop point — drop it back
near the entry and it re-flies from there, drop it near the exit and the flight ends early.
A flight tolerates three grabs; the third release makes the plane ungrabbable (no hover
lift, no arming) and it bolts for the exit at 4× cruise. Built from the 2026-08-04 plan
after a prototype gate (`design-directions/2026-08-04-scrub-sim.html`, git-ignored) where
the owner picked the Round-1 constants: `EXIT_RATE=4`, `BLEND=3`, scrub releases keep drop
height, the exit does not return to the flight line, and the exit flattens the swoop,
levels the attitude, and speeds up the streaks (uniform .45s cycle via `body.exit`).

- **Re-seed release (3b08fcd).** `mouseup` inverts `courseX` at the drop x for `s2` and
  re-seeds `pausedMs` so `flightS() === s2` immediately (negative = jumped ahead). `off.x`
  is zero by construction, so #11's spring only ever recovers y and clamp residuals; the
  swoop delta folds into `off.y` (no vertical pop) and the attitude gap decays through
  `attDelta` at `BLEND` (rejoin snap extended with a 0.5° epsilon). Main's old teardown
  formula was already correct under re-seeding, so this commit touched only plane.html.
- **Grab counter + fast exit (486a212).** `MAX_GRABS=3`; the 3rd release sets
  `exitAt = {t, s2}` and `flightS()` switches to `exitAt.s + EXIT_RATE × elapsed` — a pure
  wall-clock function, so sibling displays compute the identical exit with no per-frame
  IPC. The `'dragging'` IPC payload changed meaning: the renderer now sends the projected
  end wall-time `endAtMs` (re-seeds and the exit both move it) and main just schedules
  `endAtMs + 1000` — `flightStartAt`/`flightDurMs` deleted. The broadcast carries `grabs`
  (siblings honor the count for lift/arming) and `exit`; a deliberate deviation from the
  plan snippet adopts `exit` from any broadcast phase, not just the course handoff, so the
  second display's streaks speed up at the release instant.

Verification: the real app on the two-display setup, driven through CDP synthetic events
against the renderer's own listeners (CGEvent needs Accessibility, so no scripted OS-level
drags), with trusted-event counters proving clean runs. Measured: re-seed exact and
pop-free at the release instant (one-frame transform deltas), re-flown stretch at 1×,
double-rewind teardown 108ms from the predicted schedule, forward drop ended ~12s early
(192ms delta), cross-display exit clock identical to the millisecond, exit rate 4.00×,
teardown 62ms from `endAtMs+1s`, two-grab flights and undragged/skywriter flights
unchanged. Feel was the owner's pass. Accepted edges (from the plan): audio desyncs on
any scrub and a rewind can outlive it; a drop clamped past the course end leans on the
+1s teardown slack; sub-0.5° pose gap possible at the handoff.

## Draggable plane — #11 (2026-08-04) — ACCEPTED & CLOSED; commits d316eeb..49ef3a5

Grab the plane mid-flight (cargo style only) and drag it out of the way; the flight clock
freezes while held, and on release the plane springs back to course **at the drop height**
(gate-2 owner call — flipped from the prototype's return-to-flight-line default) and
completes its crossing. Built in four commits from the 2026-08-04 plan:

- **Motion → per-frame sim (d316eeb).** The move/swoop/bank CSS keyframes became pure
  functions of shared wall-clock flight-time `s` (`courseX`/`swoopY`/`attitude`, formulas
  derived from the keyframe tables — numerically verified identical at the sampled rows).
  Undragged flights are pixel-equivalent; multi-display windows stay in sync with zero IPC
  because every window computes the same `s`. One unified rAF `frame()` for both banner
  styles subsumed the skywriter `repin` loop and the per-frame `flyY` re-pin.
- **Drag + pausing teardown (d9a66c8).** Plane hitbox = bank rect + HIT_PAD, tag wins
  overlap; `'tag-hot'` became any-hot (tag ∪ plane ∪ mid-drag — macOS mouse capture
  delivers the whole drag to the mousedown window). Deviation `off` is cursor-driven while
  held, spring-recovered (K=55, D=10, Round-1 picks) after release; `pausedMs` shifts the
  schedule and rides the new `'dragging'` IPC so main cancels the teardown on grab and
  re-arms it shifted on release. Click guard: a mouseup ending a drag suppresses the
  same-tick tag click. Drag is deliberately URL-independent (digest/no-`.env` flights
  drag too); skywriter is not draggable (#14 filed for per-frame smoke). Streaks pause
  while held; the plane hover-lifts like the #9 tag (no cursor rendering on overlays).
- **Multi-display broadcast (9575141).** The drag-owning window mirrors rig state per
  frame over `'flight-state'` (main relays to sibling windows); one final `course`
  message hands back `pausedMs` + the persistent `off` so all displays adopt the shifted
  schedule and drop height. Course-mode flights broadcast nothing.
- **Keep drop height (49ef3a5).** `RETURN_TO_LINE = false`: recovery targets
  `{x: 0, y: off.y}` — x deviation cleans up, the line stays where dropped.

Verification: standalone browser previews (both styles) + numeric parity probes; a
git-ignored harness (`design-directions/drag-test.html`) that loads the real plane.html
with a stubbed bridge and worker-driven rAF shim exercised the full state machine
(grab/freeze/track, release/recover/rejoin, pausedMs accumulation, click guard, tag-wins
overlap, sender/receiver broadcast); Electron test flights on the real two-display setup
ran clean under ELECTRON_ENABLE_LOGGING for both styles. Real-cursor feel + cross-seam
drag were the owner's acceptance pass. Known accepted edges (from the plan): teardown
re-arms from the schedule, not the recovery (+1s slack absorbs typical drops); the audio
envelope doesn't stretch with a long hold; attitude stays frozen at the grab pose.

## Plane above every app — #12 (2026-08-04) — ACCEPTED & CLOSED; commit 68f5e81

The owner saw a plain regular app window cover the plane despite the `'screen-saver'`
level. Fix: re-assert `setAlwaysOnTop(true, 'screen-saver')` at every point that can
re-stack the window — moved last in the creation sequence (after
`setVisibleOnAllWorkspaces`, a documented level-reset vector in Electron), after
`showInactive()`, and after the AeroSpace `move-node-to-monitor` release. No new level:
screen-saver (1000) already beats regular windows (0), Dock (~20), and menu bar (~24)
once it sticks. `main.js` only; `plane.html` untouched.

The repro attempt did NOT reproduce: on unmodified code, a Swift
`CGWindowListCopyWindowInfo` probe showed both overlays holding native layer 1000 for a
full flight with a frontmost browser window on the line — so this landed as defensive
hardening; the original sighting likely needs a trigger that run didn't hit (Space
switch / AeroSpace timing). Accepted with that known. Verification was window-server
layer sampling (`kCGWindowLayer` — native truth, unlike `isAlwaysOnTop()`, which reports
Electron's own flag) because the terminal lacks Screen Recording permission for
screenshots: post-fix, 46/46 samples at layer 1000 across 3 test flights, both displays,
plus the owner's real flight pass.

---

## Pre-existing comment flood guard — #13 (2026-08-04) — ACCEPTED & CLOSED; commit bbb8938

`collectRelevantComments()` now skips comments created before the lookback window
(now − LOOKBACK_MINUTES), so a newly-assigned ticket's comment backlog can never fly —
only the `assigned` flight fires. Accepted trade: a mention in a comment older than the
window (e.g. the app was closed for over 30 min) no longer fires either. Comments with a
missing `created` fall through to the seen-set dedup. Built without a plan file —
owner-approved protocol skip for a 4-line change.

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
