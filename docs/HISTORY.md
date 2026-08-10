# jiraPlane — Build History & Reference

*Archived from STATE.md on 2026-08-03, when the two-session ticket protocol was adopted
(ported from Kal). STATE.md is now a thin quick-resume snapshot; this file holds the
per-ticket build archive. The work queue lives in GitHub Issues. Entries are
reverse-chronological; each is written at owner-acceptance time in the accept docs commit.*

Pre-protocol specs live in the projects root (`~/Developer/docs/superpowers/specs/`):
the 2026-07-23 design spec and the 2026-08-01 UI-redesign spec + accepted prototype.
From #10 onward, specs and plans are repo-local under `docs/superpowers/`.

---

## Flight start gated on overlay placement — #21 (2026-08-10) — ACCEPTED & CLOSED; commits 42413c1, 4564eb1, fa41b47

The 700ms `START_LEAD_MS` raced AeroSpace's release: a flight could start while an overlay still
sat on the wrong display (visibly so on stacked arrangements since #28). Now, with more than one
physical display attached, `createFlight` withholds `start` from the query string; the renderer
initialises `startAt = Infinity`, which pins `flightS()` at 0 — the rig waits at its ~194px
offscreen entry point. `releaseFromTilingWM` gained an `onSettled` callback that fires exactly
once per top-level call on every terminal path (success, ENOENT latch, retries exhausted, window
destroyed — what the function *does* is unchanged), and when all overlays have settled main
computes `start = max(createdAt + 700, now)`, fills `rowEndAt`, arms the teardown timer, and
delivers the start over a new `flight-start` IPC channel. A 2200ms backstop
(`START_LEAD_MS + 5×300ms`, both pre-existing receipted numbers) covers a hung CLI: the flight
proceeds on whatever displays are correct. One physical display, or a standalone-browser
`plane.html?...` page, keeps the query-string start byte-for-byte.

- **Settled = the release's terminal outcome, not a bounds check.** AeroSpace snaps a window only
  after it becomes visible, so a bounds check at show time can pass *before* the yank; the CLI
  result is the only trustworthy signal. Gate scope keys off physical display count, not `flyOn` —
  a `flyOn: main` flight on two monitors still has one yankable overlay.
- **Instrumented 10-flight run (two displays, AeroSpace live)**: all 10 settled (`unsettled=0`,
  releases OK on attempt 1, ~480–560ms), start held at the createdAt+700 floor — today's timing
  kept when settles are fast. Every flight showed 1–2 *pre-start* samples of an overlay on the
  wrong display (the bug, caught live, now hidden offscreen) and zero post-start misplacements
  across ~2,390 bounds samples. An earlier same-day run caught a slow-AeroSpace episode: 8
  consecutive flights settling at ~1985ms, correctly pushing the start to ~2s — with the fixed
  lead all 8 would have started misplaced. Degradation paths verified: all-moves-fail flies at
  retry exhaustion (~1.66s); no-AeroSpace ENOENT flies at exactly createdAt+700 on both the
  latching and latched flight. Single-display path not machine-run (needed the external
  unplugged); owner accepted.
- **Fallout capture**: quitting with a non-empty flight queue flies the rest of the queue before
  exiting (the `closed`→`flyNext` handler runs during quit) — pre-existing #1-era behavior,
  surfaced by the 10-flight queue, filed as #31.

## Planes on every display, any arrangement — #28 rows engine + flyOn setting (2026-08-10) — ACCEPTED & CLOSED; commits bc68842, fdfbc3e, 7c52ca3

The #6 engine drew one global path spanning all displays' x-range at the primary's flyY — right
only for side-by-side arrangements; a stacked or mixed layout got dead air on some displays and
no plane at all on others. `createFlight` now partitions displays into horizontal rows by
y-interval overlap (a sorted interval-merge; total, so every display lands in exactly one row)
and flies one continuous flight per row: per-row `minX/maxX/flyY/dur` and skywriter text bounds,
one shared wall-clock start across rows, exactly one audio source (the leftmost window of the
primary's row). The #11 flight-state relay and the #15 drag-release `endAtMs` re-arm are
row-scoped — grabbing one row's plane leaves other rows on script, and the teardown timer always
covers the latest-ending row. New `flyOn: "all" | "main"` pref (tray "Fly on" submenu, #10 radio
pattern) rides settings.json through a merged `saveSettings()` so the banner and flyOn setters
can't clobber each other's key; missing/unknown → `"all"`. `plane.html` untouched — it already
renders purely from query params.

- **Side-by-side is byte-for-byte** (the plan's hard constraint): a live-app param log on the
  owner's arrangement produced `minX 0 / maxX 3432 / flyY 314 / dur 23006 / audio display 1 /
  textX 91–1331` — identical to the pre-change formulas on the same bounds. One row containing
  the primary reproduces the old numbers by construction.
- **Row anchor (`ref`)**: `flyY` and skywriter bounds anchor to the primary on its row (today's
  exact values), else the row's tallest display. Spreading a row's text budget across multiple
  displays stays #20's question.
- **Verification without eyes** (screencapture blocked — the terminal lacks Screen Recording TCC,
  the same wall #24 hit): a temporary env-guarded param log (removed before commit) plus a
  CGWindowList Swift sampler (owner/bounds/layer need no TCC). Stacked run: two rows, shared
  start, flyY −734/314, durs 14366/12034, one audio source, per-row text bounds; teardown followed
  the longer row. `flyOn=main`: one window, primary bounds only. Deleted settings.json: defaults,
  no crash. Drag isolation between rows couldn't be automated (needs real drags AND eyes) — the
  owner exercised it at accept.
- **AeroSpace on stacked arrangements**: overlays occasionally got yanked to the wrong display for
  ~2–4s before `releaseFromTilingWM`'s retry re-homed them — the #21 start-lead race, unchanged by
  this ticket, just more visible stacked.

## ONBOARDING step 3 stops failing silently — #27 (2026-08-10) — ACCEPTED & CLOSED; commit 7b2426e

Doc-only. Found 2026-08-07 by the owner walking `ONBOARDING.md` as a coworker would: the step that
has you curl `/rest/api/2/myself` used bare `curl -s`, which suppresses connection, DNS and TLS
errors, so a wrong host produced an empty line rather than an error. The placeholder
`https://jira.example.com` compounded it by inviting a find-replace of just `example`, leaving a
plausible-looking hostname that isn't yours. The step also never said what success looked like.
Fix: `-sS -i` (quiet meter, loud errors, status line visible), a `tr ',' '\n' | grep -Ei | head -4`
filter that returns the four lines that matter, a stated success block, and three named failure
tells. Placeholder is now `YOUR-JIRA-HOST` in the doc and `.env.example` alike — no TLD to strand.

- **`head -4` is load-bearing, not decoration.** Jira DC's `/myself` includes `groups.items[]`
  whose members carry their own `name`, and at least one serialises `self` first, so
  `"name":"confluence-users"` survives the grep. Top-level `key`/`name` always precede `groups`,
  so the cap is what keeps group names out. Don't remove it.
- **HTTP/2 lowercases header names** (build-session finding, verified against the real Jira with a
  deliberately bad token): the rejected-token tell arrives as `x-ausername: anonymous`, not
  `X-AUSERNAME:`. The `grep -Ei` matches either way, but the doc now says so — a printed block the
  reader can never match would have been a new silent-failure mode of its own.
- **Three indirections rejected up front** (issue Constraints, from the session that found the bug):
  `read`, `pbpaste`, and friends all keep the token out of shell history and all introduce a worse
  silent failure. `read` inside a pasted block swallows the submit newline and yields an empty
  token; `pbpaste` loses the token the moment the reader copies the command. Token stays inline.
- **No `--connect-timeout`.** The partial-replace case can hang for a full connect timeout before
  printing nothing, but `-sS` already makes it loud and there is no measured basis for a number.

## Multi-display flight restored under the LaunchAgent — #24 (2026-08-06) — ACCEPTED & CLOSED; commit 860fd56

The #23 gate-2 spin-out, closed same-day. launchd's default PATH (`/usr/bin:/bin:/usr/sbin:/sbin`)
has no Homebrew, so the login instance's `execFile('aerospace')` ENOENTed on the first flight and
latched `aerospaceMissing` for the process lifetime — every overlay piled onto the focused display,
silently undoing #6. Fix (owner-picked option 1): `AEROSPACE_BIN` resolved once at module load from
the known install locations (`/opt/homebrew/bin`, `/usr/local/bin`), bare-name fallback so a machine
genuinely without AeroSpace (#8 coworkers) still latches exactly as before. Plist/installer untouched.

- **Verification (agent, monitor placement seen, not claimed).** The terminal lacked Screen
  Recording + Accessibility TCC, so flights were verified via 1s sampling of
  `aerospace list-windows --format '%{window-id} … %{monitor-id}'`: dev run and LaunchAgent run
  both held one overlay on monitor 1 and one on monitor 2 for the full ~24s flight.
  `launchctl print` confirmed the LaunchAgent still ran the default PATH. Owner flew and accepted.
- **Reusable trick: firing TEST_FLIGHT under the login instance without a tray click.**
  `launchctl setenv TEST_FLIGHT 1 && launchctl kickstart -k gui/$UID/com.jiraplane.app`, then
  `unsetenv` + another `kickstart -k` to restore steady state. Sends one [TEST] DM (#23), as a
  tray test flight would.

## Test flights announce themselves in Teams — #23 (2026-08-06) — ACCEPTED & CLOSED; commit 8be11ee

Test flights keep firing both sinks (owner decision 2026-08-06: the two-output fork should be
smoke-testable in one click), so the DM now says what it is. `teams.js` gains `markAsTest` —
`[TEST]` prefix on the ticket field plus a test subline — riding inside the flow's fixed
six-field layout, since a seventh field would be silently dropped. `main.js` sets `test: true`
on the tray/`TEST_FLIGHT` event only; real poller events never carry the field, and the overlay
ignores it (`createFlight` reads only `issueKey`). `TEAMS_WEBHOOK_URL= npm start` is the
documented escape hatch for iterating on visuals silently. Built from the 2026-08-06 plan.

- **Verification (all three runs seen, not claimed).** Run A: `TEST_FLIGHT=1` → DM with
  `[TEST] PROJ-142` + test subline. Run B: `TEAMS_WEBHOOK_URL=` → no DM, no error. Run C:
  a genuine `assigned` event → plane flew and the real ticket's DM arrived unmarked.
- **Run C repro trick (proved out, reusable).** `cycle()` re-reads `state.json` every cycle
  (`poller.js:239`), so deleting one key from `assignees` while the app runs makes the next
  cycle fire a genuine `assigned` event for a ticket you already own — no Jira write, event
  observable within 60s. The poller re-adding the key confirms consumption.
- **Mystery resolved benignly.** The build-session scare (owner assigned a real ticket, saw
  no plane, poller already caught up) was almost certainly the event firing while no app
  instance ran: Run C proved real events fly and DM correctly.
- **#24 spun out during gate 2.** The plane flew but stayed on the focused display — the
  LaunchAgent (since #7) runs without `/opt/homebrew/bin` on PATH, so the AeroSpace release
  ENOENTs and latches off, undoing #6's multi-display behavior under the login instance.
  Root-caused live (`launchctl print` showed the default PATH) and filed with fix directions.

## Coworker onboarding: plane as an optional add-on — #8 (2026-08-05) — ACCEPTED & CLOSED; commits f8b30a0..d63a5e4

The plane is now something a coworker can adopt: clone, token, `cp .env.example .env`, done —
and the repo went public (MIT) to make that possible. The overlay became optional the same way
the Teams sink already was: `PLANE=0` mirrors an unset `TEAMS_WEBHOOK_URL`, so any output
combination works from one `.env`. Built from the 2026-08-05 plan.

- **`PLANE=0` opt-out (f8b30a0).** `poller.config.plane` (`env.PLANE !== '0'`) gates
  `enqueueFlight` inside `dispatchEvent` — one line controls every flight, and Test flight
  routes through the same funnel. `?? true` keeps a fresh clone (no `.env`, `config` null)
  flying. Deliberate scope: with `PLANE=0` the "Banner style" submenu stays visible but moot.
- **Onboarding docs (3496f1d).** `docs/ONBOARDING.md` walks zero → flying plane in the
  JiraAlerts-onboarding voice (PAT creation, `/rest/api/2/myself` for username/user key,
  output matrix, LaunchAgent, known quirks); `.env.example` carries placeholders for every
  env var the code reads; README Setup leads with `cp .env.example .env`.
- **Public-flip readiness (d63a5e4).** MIT LICENSE (portfolio convention), `package.json`
  license field fixed (`"private": true` kept — npm guard, not repo visibility). Audit at
  build time: zero hits for the work-Jira hostname/username/user key across all 52 commits;
  `.env`/`state.json`/`settings.json` never committed; all 15 issues already read as-if-public.
  Owner flipped visibility at acceptance per the standing process.

## Teams DM sink: one poller, two outputs — #7 (2026-08-05) — ACCEPTED & CLOSED; commits 9639019..6750aa6

jiraPlane is now the single Jira watcher with two outputs: the plane overlay it always had,
plus the Teams DM that JiraAlerts used to send — including the reassigned-away stream, which
is DM-only (the plane deliberately skips it, #2 upheld). The Power Automate flow is untouched:
`teams.js` ports JiraAlerts' `cards.py` + `notifier.py` with the same six-field payload
contract (`ticket`, `summary`, `headline`, `subline`, `snippet`, `url`) and verbatim
headline/subline wording. With this accepted, the `com.jiraalerts.poll` LaunchAgent retires
(owner runs the bootout; JiraAlerts repo untouched). Built from the 2026-08-04 plan.

- **Poller enrichment (9639019).** Comment events carry author/body/commentId; a
  `fetchAssignees` port detects tickets reassigned away (a ticket that left the active set
  but is still yours — e.g. closed — is skipped, not a reassignment); digest events carry
  per-stream counts. New optional config: `TEAMS_WEBHOOK_URL` (empty disables the sink),
  `SNIPPET_CHARS` (default 280).
- **`teams.js` sink (89dfabc).** One file: sanitize + wiki-markup snippet helpers, per-event
  payload builders, webhook POST with a 30s timeout; any 2xx is success (Workflows returns
  202 with an empty body). No DM retry: state advances before output — the poller's
  "a plane can't fail" model — so a failed DM is logged and dropped.
- **Dual dispatch + single-instance lock (b51127d).** `dispatchEvent` is the one funnel for
  real polling and the tray test flight: every event DMs, everything except `reassigned`
  flies. `requestSingleInstanceLock` makes a second `npm start` exit immediately, since the
  login-launched instance now holds the slot.
- **Login LaunchAgent + README (6750aa6).** `scripts/install-login-launch.sh` writes and
  loads `com.jiraplane.app`, running the repo's real Electron binary with the repo as
  argument — not `app.setLoginItemSettings` (registers bare Electron.app for unpackaged
  apps) and not the `node_modules/.bin` shim (a Node script; launchd's PATH has no Homebrew
  node). `KeepAlive.SuccessfulExit=false`: crash restarts, tray-Quit stays quit. README
  covers the env keys, installer/uninstall, the dev-instance lock note, and the JiraAlerts
  retirement commands.

Deviations from JiraAlerts flagged at review: the flood valve is jiraPlane's
`MAX_EVENTS_PER_CYCLE` (default 3), not JiraAlerts' 10; reassigned events count toward the
valve though they never fly solo; "Pause polling" now pauses DMs too — one engine.

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
