# jiraPlane — Build History & Reference

*Archived from STATE.md on 2026-08-03, when the two-session ticket protocol was adopted
(ported from Kal). STATE.md is now a thin quick-resume snapshot; this file holds the
per-ticket build archive. The work queue lives in GitHub Issues. Entries are
reverse-chronological; each is written at owner-acceptance time in the accept docs commit.*

Pre-protocol specs live in the projects root (`~/Developer/docs/superpowers/specs/`):
the 2026-07-23 design spec and the 2026-08-01 UI-redesign spec + accepted prototype.
From #10 onward, specs and plans are repo-local under `docs/superpowers/`.

---

## Tray icon: paper plane from the popover stage — #52 (2026-10-17) — ACCEPTED & CLOSED; commit bda3a64

The popover's preview stage drew a paper plane in its fake menu bar while the real tray
showed a right-pointing arrowhead (`f916268`). The three stage paths now live in
`assets/iconTemplate.svg` (black fills, opacities 1 / .72 / .5) and are rendered with
`rsvg-convert -w 16 -h 16` and `-w 32 -h 32` into the two template PNGs `main.js` already
loads. No code change: Electron marks `*Template.png` as a template image and finds the `@2x`
file by name, so macOS tints the plane for the menu bar.

- **Proven:** both PNGs hold only `(0,0,0,a)` pixels (16 px: 165 at alpha 0, 14 at 255, 14
  at 184); a fresh review re-rendered both from the SVG and got identical pixels. Montage
  (old / toned / flat, 16 and 32 px, black on white and white on `#262626`): toned shows the
  wing fold at 16 px, flat merges into one arrowhead. Full check
  `env -u ELECTRON_RUN_AS_NODE TEAMS_WEBHOOK_URL= TEST_FLIGHT=1 OPEN_POPOVER=1 npm start` in
  the worktree: test flight crossed (PROJ-142 tag captured mid-flight), the plane showed in
  the menu bar on the Retina display (`@2x`) and on the 1x external display (16 px file,
  dimmed as the inactive bar). Synthetic left and right clicks each logged
  `popover: tray=990,0 32x33` and the panel was on screen 0.4 s later. Dark mode flipped and
  restored (`true` → `false` → `true`). Fresh review: 0 Critical, 0 Important.
- **What the plan got wrong:** flipping Appearance did not change the menu bar: on this Mac
  the bar's glyph colour follows the wallpaper, so both captures showed a white plane and the
  dark-glyph-on-light-bar case was not seen by the build. `npm install` left out the Electron
  binary (the #53 case); `node node_modules/electron/install.js` fetched it.
- **Deferred:** the .5 keel is under one pixel wide at 16 px and nearly vanishes on a 1x
  display (stage geometry kept on purpose); flat fallback kept in `design-directions/icon-52/`.

## Login installer fetches the Electron binary — #53 (2026-10-16) — ACCEPTED & CLOSED; commit 79a4993

Electron 43's npm package has no postinstall, so a clone that ran `npm install` and nothing
else has no `node_modules/electron/dist/`, and `scripts/install-login-launch.sh` stopped on
`run 'npm install' first`, a hint that cannot fix it. The installer now runs
`node node_modules/electron/install.js` itself when the binary is missing (the same call
`updater.js` makes after `npm install`, #48), prints one line saying so, and carries on. Only
when `node_modules/electron` is absent does the old hint remain, because then it is true.
`set -e` ends the script before the plist is written if the fetch fails. The binary-present
path (ONBOARDING step 5 before step 6, the settings toggle) is unchanged.

- **Proven:** every installer run used `HOME=$(mktemp -d)` and `--write-only`. No `dist/`
  before the change: old hint, exit 1, no plist. After: `Electron binary not found — fetching
  it (…)`, exit 0, plist written, binary present. Third run: no fetch line, exit 0, plist.
  The plist's ProgramArguments name the worktree's `dist/…/Electron` and the worktree.
  `node_modules/electron` moved away: old hint, exit 1. Full check
  `env -u ELECTRON_RUN_AS_NODE TEAMS_WEBHOOK_URL= TEST_FLIGHT=1 npm start` ran on the fetched
  binary (`flight: assigned PROJ-142 … durMs=12034`, `update: check: nothing newer`). The real
  `~/Library/LaunchAgents/com.jiraplane.app.plist` mtime was the same before and after. Fresh
  review: 0 Critical, 0 Important, 1 Minor. Main-folder check after the merge (same command):
  `flight: assigned PROJ-142 … durMs=12034`, `update: check: nothing newer`.
- **What the plan got wrong:** it expected install.js download output; the zip was already in
  `~/Library/Caches/electron`, so install.js extracted it with no output.
- **Deferred:** no re-check of the binary after a fetch that exits 0 (only bites with
  `ELECTRON_OVERRIDE_DIST_PATH` or `ELECTRON_INSTALL_PLATFORM` set); no uncached download was
  run.

## Update check in the popover: tag, one click, restart — #48 (2026-10-16) — ACCEPTED & CLOSED; merge f6891cd

At launch and every 24 h (the ticket's guess) the app asks the remote for its `vX.Y.Z` tags.
When the newest one is not already in HEAD, the popover header gets a third line,
`vX.Y.Z available`, and a small **Update** button under Pause (the owner's pick of three
variants, `update-2-head`; the losers `update-1-banner` and `update-3-row` are in
`design-directions/`). The click closes the panel, re-checks the clone, checks out the tag
(detached), runs `npm install`, fetches the Electron binary (`node_modules/electron/install.js`;
Electron 43 has no postinstall and the login job execs the binary directly), and restarts once
no plane is in the air. Flights are held from the click to the restart. The login job restarts
by `app.exit(1)` (KeepAlive brings it back as `com.jiraplane.app`); a dev run by
`app.relaunch()`. A clone with modified tracked files or on a branch other than `main` is
refused with the reason (`Can't update: … See ONBOARDING § 7.`); a failed install keeps the app
running and shows `Update failed: <first error line>`. No remote tags or no network: no line,
one `update: check failed:` log line. `updater.js` owns the git/npm work and resolves absolute
`git`/`npm` paths (launchd PATH, #24). ONBOARDING § 7 now leads with the button; its manual path
checks out the newest tag instead of pulling. First tag: `v0.1.0` on this merge.

- **Proven:** `updater.js` under plain node on a scratch clone: newest of v9.9.0/v9.10.0 is
  v9.10.0; `v1.2`, `release-1`, `v9.11.0-rc1` ignored; a local-only `v9.20.0` not offered; a
  tag-less remote → null; unreachable remote rejects with git's `fatal:` line; dirty file /
  `feature-x` branch / `main` → refused / refused / allowed; launchd PATH resolves
  `/usr/bin/git /usr/local/bin/npm`; install with the Electron binary deleted puts it back; a
  1 ms install timeout lands in `npm timed out`. Live on the scratch clone (dev restart):
  `TEST_FLIGHT=1 UPDATE_NOW=1` updated during the flight, `restarting as dev run (relaunch)`
  logged ~1 s after the 12 s flight ended, new pid = the marker commit's pid file, HEAD at
  `v9.10.0`. Broken-dependency tag: `npm install failed: npm error code E404`, same pid kept
  running, panel read `Update failed: npm error code E404. See ONBOARDING § 7.`, HEAD at the
  tag, tracked tree clean. Worktree full check: `update: check: nothing newer`, panel as
  before. Popover: with no update, heights 293/197/293/212 and every element's geometry and
  colour identical to main; `#update` keeps its node across same-content pushes. Fresh review:
  0 Critical, 2 Important (local-only tags offered; unbounded install), both fixed, plus the
  three-log-lines finding re-graded and fixed. Login-job restart: left to the owner on the `/tmp/jp48` scratch copy; no result reported at gate 2 (the owner accepted with "accepted, land it"). Main-folder check after the merge: `update: check: nothing newer`, flight and popover lines as in the worktree.
- **What the plan got wrong:** candidates from local `git tag -l` would offer tags never pushed
  (and the owner's worktrees share refs with the main checkout), now `git ls-remote`; the
  "last stderr line" is advice for git and a log path for npm, now the first error line;
  `npm install` alone leaves no Electron binary on Electron 43; the plan's restart branch came
  before the quit check in `flyNext` (a Quit during `restarting` would have relaunched); the
  `screencapture` of `Restarting after this flight…` during a flight did not catch the panel.
- **Deferred:** ONBOARDING § 7's manual tag pick does not skip prerelease tags; Electron
  installer errors would show a stack line in the panel; Quit during `installing` can leave
  npm half done; the `failed` line lasts one process; a transient `launchctl print` failure
  would relaunch outside launchd; Settings first opened mid-install loads new HTML under old
  main.js; a daily check and a click can collide on git's index lock. Filed: tray icon → paper
  plane (#52); login installer's "run npm install first" hint (#53).

## Docs stop naming the deleted tray menu — #50 (2026-10-16) — ACCEPTED & CLOSED; commit a285e11

Three prose lines deferred from the #41 final review. README's Physics section said the second
banner style was "in the tray"; it now says "picked in Settings…". usage.md's `settings.json`
line said "currently the banner style" while the tray section two screens up said Fly on
persists too; it now names Banner style and Fly on. ONBOARDING's gotcha said "**Pause polling**
in the tray"; the panel's switch is labelled Pause, so it now names the panel switch first and
*Pause polling* in Settings… second. No code.

- **Proven:** `git diff --stat` → `3 files changed`, one hunk each; the three planning greps
  return zero hits after the edit. `env -u ELECTRON_RUN_AS_NODE TEAMS_WEBHOOK_URL= TEST_FLIGHT=1
  npm start` from the worktree printed `jiraPlane already running — exiting this instance` (the
  owner's login instance held the single-instance lock, #49 precedent); no flight flew from the
  worktree.

No `Build P/P pages` figure: this repo has no build check (AGENTS.md `# Verification scope`).

## package-lock.json license matches package.json — #49 (2026-10-16) — ACCEPTED & CLOSED; commit e0eb995

One regenerated line. `package-lock.json`'s root entry said `"license": "UNLICENSED"` from the
scaffold commit (`f916268`); `package.json` has said `MIT` since #8 (`d63a5e4`), so every
`npm install` on a fresh checkout rewrote the line and left an unrelated diff. `npm install`
(npm 11.11.0, node v24.14.1) wrote `"license": "MIT"` at line 10; nothing else in the lockfile
moved. ONBOARDING §7's `git checkout package-lock.json` recovery step stays: a coworker who
already ran `npm install` holds the MIT edit locally, and the pull that brings this commit still
refuses. #35's rewrite drops the step once everyone has pulled past it.

- **Proven:** worktree `git diff --stat` → `1 file changed, 1 insertion(+), 1 deletion(-)`, the
  one hunk at line 10. Fresh-checkout proxy: the two manifests copied to a temp dir, `npm install
  --package-lock-only --ignore-scripts`, `diff` → exit 0; a second `npm install` in the worktree
  → `up to date`, stat unchanged. The test flight was skipped by owner choice: the login
  instance (pid 86609) held the single-instance lock (`jiraPlane already running — exiting this
  instance`, exit 0); the worktree's electron is v43.2.0 and byte-identical (`cmp`) to the
  binary the login instance was running, and the diff changes no version, `resolved`, or
  `integrity` field.
- **Fresh review:** 0 Critical, 0 Important, 0 Minor. The reviewer also ran a full
  `npm install --ignore-scripts` in an empty temp dir and `npx npm@10 install
  --package-lock-only`; both left the lockfile byte-identical, so npm 10 does not bring the
  drift back.

No `Build P/P pages` figure: this repo has no build check (AGENTS.md `# Verification scope`).

## ONBOARDING update path: pull, install, restart — #45 (2026-10-16) — ACCEPTED & CLOSED; commit ce0c222

Docs only. `docs/ONBOARDING.md` gains `## 7. Update`: `git pull`, `npm install`, then restart
the running instance, with each command alone in a fence and one "you should see" line. Restart
has two cases: a terminal `npm start` (Ctrl-C, start again) or the login instance (re-run
`./scripts/install-login-launch.sh`, which does bootout + bootstrap and also covers a login
instance quit earlier). The section warns that a terminal `npm start` left running makes the
new login instance lose the lock and stay down (KeepAlive `SuccessfulExit=false`). The check
that the restart worked is right-click → popover. A draft coworker note (settings window,
popover, update steps) is on #45 for the owner to send.

- **Proven:** test flight in the worktree; on the owner's Mac the documented path against the
  login instance (run by the owner — the auto-mode classifier blocked the agent from touching
  the login job): pid 85687 → 86609, new start 10:41:25 after the 10:41:24 pull, old pid gone,
  process runs Electron from the main checkout. A second `npm start` while the login instance
  ran printed `jiraPlane already running — exiting this instance` and exited 0; the login pid
  did not change. The owner chose to skip the post-merge test flight on main: the merge
  changed no code (`git diff 46a314d main -- . ':!docs'` empty), and the login instance was
  already running that code.
- **Fresh review:** 0 Critical, 3 Important, all fixed: `npm install` dirties
  `package-lock.json` (#49), and a later pull that touches the lock then refuses, even when the
  local edit matches upstream (reproduced in a scratch repo), so the section has a
  `git checkout package-lock.json` recovery step; the dev-restart `npm start` got its own fence;
  the "new code" check dropped `git log -1` (it shows the commit on disk, not the one running).
  Deferred minors for #35's rewrite: the Settings launch-at-login toggle as a second login
  path, "leave and come back" wording for the quit-earlier case, other `npm install` outputs,
  an installer `Bootstrap failed` line.
- **What the plan got wrong:** its fence check counted only the three fences it expected, so
  the inline `npm start` slipped past it; Review Focus #3 (dirty checkout) was not rare —
  every clone since #8 has the lock drift. #51, filed during the build, duplicated #49 and was
  closed.

## Popover contract: right click opens the popover, native menu deleted — #41 (2026-10-15) — ACCEPTED & CLOSED; commit 4dddfa1

Fifth and last slice of #36. The tray now has one surface: right click calls the same
`togglePopover(bounds)` as left click, so a right click on a closed panel opens it and on an
open panel closes it. `buildMenu()` and the `Menu` import are gone, with the native menu's
Replay, Banner style, Fly on and Pause polling items. Every one already had a home: Test
flight, Settings…, Quit and the replay rows in the popover (#38, #40); Pause in the popover
header and the settings window (#39, #29); Banner style and Fly on in the settings window
(#29). `replayFlight(index)` lost its `index = 0` default: the popover row handler is its
only caller. Done-when 1 (Settings… opens the #29 window, second click refocuses) had
already shipped in #38. Pause stays session-only (#39); `saveSettings` is untouched.
`docs/usage.md`'s tray section now describes the one panel.

- **Native unknowns:** U1 (right click without bounds) did not happen: the right click's
  `popover:` line carried real tray bounds. U2 (synthetic click swallowed) did not happen:
  CoreGraphics right clicks posted from osascript reached the tray.
- **Proven:** static checks (no menu code left; one `right-click` handler; one
  `replayFlight` caller; the settings setters still called from `'settings-set'` and
  `'popover-set-paused'`). Live runs in the worktree and again on main after the merge:
  `TEST_FLIGHT=1 OPEN_POPOVER=1`, panel at layer 101 under the plane's layer 1000; a
  synthetic right click closed the open panel, a second one reopened it with a new
  `popover:` line; a screenshot showed the #37 panel and no native menu; no errors. The
  quit-and-relaunch persistence check was left to the owner. Fresh review: 0 Critical,
  0 Important. The owner accepted at gate 2.
- **What the plan got wrong:** its "delete, don't hide" grep also matches the plan's own
  "Never setContextMenu" warning comment, so "no-menu" could not print (comment kept; the
  grep over code lines is empty); its `docs/usage.md` line range was off by 2.
- **Deferred:** three doc lines elsewhere still name the old menu (#50); a fresh
  `npm install` rewrites the lockfile's license field (#49). #44's usage-doc item landed
  here.

---

## Popover recent flights: last 5 real flights, click a row to replay — #40 (2026-10-15) — ACCEPTED & CLOSED; commit 4483f77

Fourth slice of #36. #34's single remembered event (`lastFlown`) became a ring of at most 5,
`recentFlights`, newest first (`RECENT_FLIGHTS_MAX`). Only real assigned / mention / comment
events enter it; test flights, digests and reassigned fly (or not) but are never listed.
Each entry is stamped `at: Date.now()` when the poll dispatches it: poller events carry no
Jira timestamp, so a row's time is when the app found the event. The native Replay item
reads `recentFlights[0]`; the popover state's `flights` is the ring in the #37 contract
shape. A row click sends its index over `'popover-replay'`; main hides the panel and
replays through the queue only, so no Teams DM. The page rebuilds rows only when the
list's signature (`at:issueKey` per row) changes; on the 1 s push it rewrites the times in
place, so the row under a click survives. No CSS or markup change: the #37 pick already
held the rows. In-memory only; the list empties on restart.

- **Native unknowns:** U1 (hover after a rebuild) was not observable by the agent and not
  reported at gate 2.
- **Proven:** static checks (`lastFlown` gone, no `innerHTML`, no page timers); standalone
  browser checks: 5 rows at 293 px, a click logs the right row, the same row element across
  an unchanged re-render, a sixth flight on top with the oldest gone, the empty state at
  197 px; live test flights leave "No flights yet" (worktree run and the post-merge run on
  main, panel at layer 101, 320 × 197, "Last poll just now"); bad replay indexes fly
  nothing. Fresh review: 0 Critical, 0 Important. The owner accepted at gate 2.
- **What the plan got wrong:** its `pgrep` pattern never matches a worktree's Electron path;
  its live run assumed a `.env` the worktree does not have (the run showed the config-error
  header instead); it expected the panel still open 30 s after launch, but in that session
  the panel hid itself ~3-8 s after `OPEN_POPOVER` showed it, and main's unchanged code did
  the same (control runs), so the evidence was a screenshot taken while it was up.
- **Deferred minors:** a click in the same instant a new flight lands replays the new top
  flight (rows are addressed by index, plan decision 2; the fix is to send `at`); the
  handler comment "anything else is ignored" overstates the guard. `npm install` rewrites
  `package-lock.json`'s license field (UNLICENSED vs package.json's MIT); reverted, not filed.

---

## Popover status header: live last poll + pause switch — #39 (2026-10-13) — ACCEPTED & CLOSED; commit 2a7b921

Third slice of #36. The popover header shows real poll state: "Last poll 12s ago", "Paused",
or "Polling disabled: <reason>" in red. Until a poll succeeds it keeps "Waiting for first
poll". `lastPollAt` is the last poll that succeeded, so failing polls let the age keep
growing. The Pause switch calls `setPollingPaused()`, the same flag as the native menu item
and the #29 settings window, and `refreshSurfaces()` now pushes to both windows. Main owns all
state and all timing: it sends `popover-state` before `show()`, on `did-finish-load`, after
each successful poll, on every pause change, and every 1 s while the panel is open
(`popoverClock`, started on `'show'`, cleared on `'hide'`). The page runs no timers. After
each render the page sends its panel height (`popover-fit`) and main resizes the window, top
edge fixed: 197 empty, 212 with the config error. `flights` stays `[]` for #40.

- **Native unknowns:** U1 (`setSize` on a non-resizable panel) and U2 (panel `'show'` /
  `'hide'` events) were not hit, so neither fix shipped.
- **Proven:** the static checks (`node --check`, no `innerHTML`, no page timers); the
  standalone sizes 197 / 212 / 293 (empty, error, fake rows); run 1 crops counting "just now"
  up to 50s and back on every poll, the panel at layer 101; run 2's config error at 212 high,
  red over two lines, Pause dimmed, Quit row whole; run 3 "Waiting for first poll" after
  failed polls (read over CDP while the screen was locked, then shot); run 4 the popover
  Pause showing in the settings window and a settings resume showing "Last poll 26s ago" in
  the popover; the `TEST_FLIGHT=1` full check; and the owner's eight-item gate 2 pass.
- **Review:** 0 Critical. The one Important (a reopened panel might paint its pre-hide frame
  for 1–3 frames) had no red command: the agent can't click the tray, and the inspector route
  recorded only black frames. It went to gate 2 item 5 and the owner passed it. If it ever
  shows, the fix is `backgroundThrottling: false` on the popover window.
- **What the plan got wrong:** it dropped the preload's empty-state seed but kept the Pause
  handler reading `shown.pollingPaused`, so a click before the first push throws (minor
  below). Its runs had no real tray click, so the reopen frame was left to the owner.
- **Found at gate 2, filed as #47:** with two displays, the panel opens on the display whose
  menu bar was last active, not the one clicked. The tray click bounds name the wrong menu
  bar. That is #38's placement code, unchanged here.
- **Deferred minors:** Pause clicked before the first push throws (fix:
  `api.setPaused($('pause').checked)`, the settings.html pattern); the `'show'` handler does
  not clear the clock before `setInterval`, so two shows without a hide would leak a 1 s
  timer; usage.md says the last poll "finished" where it means "succeeded".

---

## Tray popover shell — #38 (2026-10-13) — ACCEPTED & CLOSED; commit b645203

Second slice of #36. Left click on the tray icon opens `popover.html`, the #37 pick, as a
320 × 197 panel anchored under the icon. Its rows are Test flight, Settings… (opens the #29
window) and Quit. Right click keeps the native menu until #41. The panel is a hidden
`type:'panel'` window with `vibrancy:'menu'`, made at launch and never destroyed. A blur or a
second click hides it. It starts on an empty state: "Waiting for first poll", "No flights
yet", and a Pause switch that snaps back off. `preload-popover.js` sends the three intents;
#39 and #40 push real state. `OPEN_POPOVER=1 npm start` opens it on launch. At gate 2 the
owner changed the row highlight from teal to the native menu blue, `#2e53b7` (sampled from
their screenshot), with white text. The Settings window stays teal; the owner's clickable
Fly on monitors went to #46.

- **Native unknowns:** U1 hit. AeroSpace adopts the panel, and the plan's fix (release it
  after show) made the panel blur and hide ~1.9 s later (instrumented run, plus a control
  run without the release). The fix was reverted per the plan's "report it and stop". The
  owner passed all nine gate 2 items without it. U2 to U5 were not hit, so their fixes did
  not ship.
- **Proven:** the panel at layer 101 at the logged position (window probe), a test flight's
  overlay at layer 1000 over it, the browser sizes 320 × 197 / 293 / 212, and the owner's
  nine-item gate 2 pass.
- **What the plan got wrong:** its `OPEN_POPOVER` hook read the tray bounds at
  ready-to-show, but a new Tray reports placeholder bounds (y = display bottom) for its first
  ~130 ms, so run 1 opened the panel off-screen; the hook now waits 1 s. Its grep for
  `setContextMenu` matches the comment the plan itself mandates; the call form is gone. It
  missed that a fast second click arrives as `'double-click'`; the final review caught it,
  and `setIgnoreDoubleClickEvents(true)` fixed it.
- **Deferred minors:** clicking another menu-bar item may not close the panel; Escape does
  not close it; the usage.md right-click list lacks Replay and Fly on (older gap).
---

## Popover design pick (popover-1-menu) — #37 (2026-10-13) — ACCEPTED & CLOSED; docs commit only

First slice of #36, the CodexBar-style tray popover. Three standalone variants live in the
git-ignored `design-directions/`, each on fake data with a preset strip (flights, empty,
paused, error) and the state and bridge contract #38 will feed. `popover-1-menu.html` is a
menu-like list with fixed 24 px rows, 320 × 293 at 5 rows, 197 empty, 212 with a config
error. `popover-2-cards.html` is one card per flight, 360 × 529 / 335 / 348, and its height
follows the content. `popover-3-timeline.html` is a timeline, 340 × 297 / 177 / 205. The
owner picked variant 1; variants 2 and 3 stay in `design-directions/`.

The one tweak: the key column is capped at 120 px, which fits a 14-character key (measured
119.2 px). A longer key ends in an ellipsis, so snippets keep their width. Two owner
decisions for #38: the shell starts on an empty state, so the panel shows "Waiting for first
poll" and "No flights yet" until #39 and #40 send real data; and the Settings… row stays
enabled, so #38's "visibly disabled" line is stale. The review minors #38 inherits are in
the plan's Pick section.

- **Proven:** the plan's greps and browser checks passed for all three variants on every
  preset. After the tweak, PLATFORM-10482 measured 119.2 px uncut, a 17-character key capped
  at 120 px with an ellipsis, and the three sizes did not change. `TEST_FLIGHT=1 npm start`
  flew on the main and the external display; no tracked file changed.
- **What the plan got wrong:** its `fit-content(120px)` track came out at 106 px under
  subgrid and cut PLATFORM-10482; `max-width: 120px` on `.key` works. Its #38 scope (footer
  only) conflicted with every variant assuming full state; the final reviewer caught it and
  the owner chose the empty start. Its "full redraw on every call" rule let v3 rebuild the
  whole panel on each push, which loses focus and mid-press clicks; deferred because v1 won.
---

## Settings window (General/Appearance/About) + launch-at-login toggle — #29 (2026-10-12) — ACCEPTED & CLOSED; commits ee3a7bc, 26e4016

The tray gains **Settings…**, which opens one 680 × 460 window (`settings.html`, sandboxed
preload `preload-settings.js`). The owner picked variant 3 of three (`settings-3-preview.html`,
preview-led: a live sky sketch + display diagram above the controls), bg `#222222`, no tweaks;
variants 1 (Alcove grouped card) and 2 (single scroll + TOC) stay in `design-directions/`. The
page sends intents (`settings-set`); main validates, saves, and pushes `settings-state`.
`refreshSurfaces()` redraws the tray menu and pushes to the window, so the two always agree.
Pause stays session-only (#39 keeps it so). The menu did NOT slim to Test flight / Settings… /
Quit — #36 took that over; the old items stay. Close hides; the window is a singleton.

Task 3 shipped: **Launch at login** wraps `scripts/install-login-launch.sh`. `setLaunchAtLogin`
asks `launchctl print` whether this process is the login job (`pid = N` line). If it is, On
runs the installer with `--write-only` (new flag: write the plist, skip bootout/bootstrap) and
Off deletes the plist but leaves the job loaded until logout. From a dev instance, On runs the
full installer; the login copy it starts hits the single-instance lock and exits 0, so
`KeepAlive SuccessfulExit=false` does not restart it.

- **Proven on this Mac:** the exit-0 fact (dev instance up, installer run: `state = not
  running`, `runs = 1`, `last exit code = 0`, one process); the pid parse (kickstart, `pid =
  46224`, regex matched 46224, rejected 4622 and 462241); full check `TEST_FLIGHT=1
  OPEN_SETTINGS=1` flew the cargo plane above the open window; `settings.json` unchanged.
- **What the plan got wrong:** `app.focus({steal: true})` does not bring the window forward on
  a launch with no click — one `OPEN_SETTINGS=1` run opened it behind the active app. Task 3
  had no backup step before the installer run, so the owner's plist was rewritten (valid, same
  size, different bytes — likely path letter case; unproven) instead of restored. Variant 1's
  brief said "each setting its own card" while the Alcove reference groups rows.
- **Deferred minors (final review, filed as #44):** a file dropped on the window navigates it away from
  `settings.html`; an open window does not re-read state on focus; the usage.md Settings…
  bullet omits Launch at login.
- **Accepted** by the owner on 2026-10-12.

## Display set logged per flight; display changes logged, not handled — #22 (2026-10-12) — ACCEPTED & CLOSED; commit 750fd7c

Decision: a flight keeps the display set it was created with. Nothing in the flight reacts to a
display being added, removed or resized, because a rebuild would drop the #11/#15 drag state and
a flight is ~12 s. A display that wakes mid-flight gets no plane until the next flight; a flight
created while a display sleeps flies the awake displays only; a flight created mid-wake flies
whatever `getAllDisplays()` returned (no settle delay — nothing measured to base one on); a
display removed mid-flight keeps its overlay. What changed: `createFlight` logs one ISO-stamped
`flight:` line (event, flyOn, gated, each display as `id WxH@x,y`, each row's
minX/maxX/flyY/durMs), and `whenReady` subscribes `display-added` / `display-removed` /
`display-metrics-changed` (bounds only — workArea changes with the Dock) to log a `display:`
line, marked `mid-flight` while `activeFlight` is set. `main.js` only, +23 lines.

- **A (launch flight), real line:** `flight: assigned PROJ-142 flyOn=all gated=true
  displays=[1 1512x982@0,0 primary + 3 2560x1440@1512,-269] rows=[minX=0 maxX=4072 flyY=314
  durMs=12034]`. Later in the session the external logged as `1920x1080@1512,0` (macOS agreed;
  `maxX=3432`) — the log follows whatever the desk is.
- **B (power off mid-flight):** the external's power button does NOT de-enumerate it. The log
  showed `display: removed ... mid-flight` then `display: added ... mid-flight` 5 ms apart, and
  macOS kept listing the display as online while it was dark. The owner reported the built-in
  looked fine (no second or misplaced plane). A real Mac sleep did de-enumerate it (removed,
  then added 11 min later on wake, no flight in the air).
- **Not run:** C–F (cable unplug / replug flights, Dock noise). The wake-mid-flight path and the
  add→settle time are unmeasured; the owner accepted without them.
- **Accepted** by the owner on 2026-10-12 after A and B.

## Constant wall-clock flight duration — #17 (2026-09-27) — ACCEPTED & CLOSED; commit 8ecc363

Each row now flies in the time its reference display (primary if it is in the row, else the
tallest) takes alone at 175 px/s, so a wider row flies faster instead of longer. `createFlight`
derives `durMs` from `ref.bounds.width + 194 + 400` instead of the whole row span. The renderer
is unchanged: `plane.html` gets speed only as `(toX − fromX) / durS`, so the swoop period, audio
envelope, skywriter timing and the #15 drag re-seed all follow the shorter `dur`. Owner chose
constant wall-clock over a capped span (2026-08-10). One-display rows are unchanged
byte-for-byte, because `ref` is that display. No speed cap yet.

- **Computed, not measured:** on the 1512+1920 desk, 23.0 s → 12.0 s, and the plane reaches
  the external display at ~5 s instead of ~10 s (plane speed ~335 px/s). The ticket's '~10 s'
  was the pre-#6 figure; the accepted single-screen duration has been 12.03 s since the 400px
  exit margin (`9438763`).
- **Accepted** by the owner on 2026-09-27 from the diff. No measured log numbers or feel verdict
  were recorded at accept. The code was written 2026-09-26 and sat uncommitted at gate 2.

## Tray "Replay <KEY>" re-flies the last real flight — #34 (2026-09-24) — ACCEPTED & CLOSED; commit 83b49f1

A new tray row under Test flight re-flies the last real event the plane flew: same banner, same
clickable tag URL, no second Teams DM. `lastFlown` is set in the plane-sink branch of
`dispatchEvent`, and only for `assigned` / `mention` / `comment` events without `test: true`.
It is an allowlist, so digests, `reassigned`, test flights and any future event type never
become the replay target. Setting it rebuilds the menu through the same
`tray.setContextMenu(buildMenu())` path Pause polling uses. `replayFlight()` calls
`enqueueFlight` directly, never `dispatchEvent`, so the Teams sink never sees a replay, and the
existing queue makes a replay clicked mid-flight wait its turn. In-memory only: after a restart
the row is a greyed-out `Replay` until the next real event. Under `PLANE=0` the plane branch
never runs, so the row stays disabled.

- **Known tradeoff (plan decision 1):** the event is remembered at dispatch, not at takeoff. On
  a poll cycle that returns two events, the row shows the second key while the first is still
  flying.
- **Verified** (owner at the tray, dev instance with `TEAMS_WEBHOOK_URL=` empty): fresh launch
  shows a greyed-out `Replay`, and a test flight leaves it greyed out; a real event armed it
  to `Replay <KEY>`; the replay flew the same banner and its tag opened the same browse URL; a
  test flight after that kept the real key; a replay clicked during a test flight queued behind
  it. No-DM rests on the code path (`replayFlight` has no `dispatchEvent`), not on a Teams run.
  Not flown: the digest case (`MAX_EVENTS_PER_CYCLE=0`) and `PLANE=0`, owner accepted before
  those runs. The allowlist and the plane-sink placement are the code-level evidence for both.

## Login installer works on a fresh Mac — #33 (2026-09-03) — ACCEPTED & CLOSED; commit 9d9c667

`scripts/install-login-launch.sh` wrote the plist with `cat > "$PLIST"` into
`~/Library/LaunchAgents/` and never created the folder. A fresh macOS account has no such
folder until some app makes one, so the redirect failed on line 19 and `set -e` aborted before
`launchctl bootstrap`. Found onboarding the first coworker (`npm install` and Test flight had
already worked); never seen on the owner's Mac because other apps had created the folder years
ago. Fix is one line before the heredoc: `mkdir -p "$(dirname "$PLIST")"`. Hotfix landed
straight from the working tree at owner direction — no plan file.

- **Verified** by running the script with `HOME` pointed at an empty scratch dir: exit 0, folder
  created, plist written. Gotcha for anyone repeating that: the script bootouts/bootstraps by
  label, so the scratch run re-registered the owner's real login agent from the scratch plist.
  Re-running the installer normally restored it (path back to the real LaunchAgents, state
  running). Don't use a fake HOME as a repro without re-running the installer afterwards.

## Quit with a non-empty flight queue exits promptly — #31 (2026-08-11) — ACCEPTED & CLOSED; commit 4506d75

`app.quit()` destroys the active flight's windows; each window's `'closed'` handler decrements
the open counter, and the last one called `flyNext()` — which created the next queued flight's
windows mid-quit, so quit stalled until the whole queue drained (found during #21's instrumented
10-flight verification run; pre-existing #1-era behavior). The fix is a `quitting` flag set on
`before-quit`, checked first in `flyNext` — quit's window destruction then finds nothing
re-creating windows and Electron exits normally. Queued flights are discarded, not persisted:
the Teams DM (if any) already went out at dispatch time and the poller advances state before
output, so only the visual is dropped — which is what quitting asks for. The active flight is
cut off mid-air, not flown out (letting it finish would keep the app alive up to ~26s after
Quit, most of the original complaint).

- **Verified single-display** (3-flight burst, Quit mid-first-flight): baseline showed two fresh
  planes taking off *after* Quit and the prompt back 13.9s later; with the fix, exit in 48ms and
  no new flight. Normal draining unchanged: 2 flights each flew their full ~13.7s schedule
  back-to-back, app stayed resident, and an empty-queue Quit exited in 69ms. No human at the
  tray that session — the repro was driven by a temporary env-gated driver calling
  `testFlight()`/`app.quit()` (the tray items' exact functions), removed before commit.
- Baseline logs also showed stale teardown timers cross-firing into successor flights during the
  drain (flight 1's timer destroyed flight 2 mid-quit) — same mechanism, gone with the guard,
  nothing separate to fix.

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
