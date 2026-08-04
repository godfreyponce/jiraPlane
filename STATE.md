---
glass: jiraplane
status: in-progress
last_worked_on: 2026-08-04
next_action: "No green-lit ticket. #7 (Teams DM sink), #8 (coworker onboarding) and #14 (per-frame skywriter smoke) await owner green-light + ready-for-agent before /plan-ticket."
blocked_on: "owner green-light on the next ticket (#7/#8/#14)"
phase: "v1 shipped and accepted through #11: #1 tray + overlay queue; #2 live polling 2026-07-31; #3 B2 paper glider redesign 2026-08-02; #4 cargo-tag pendulum banner 2026-08-02; #6 continuous multi-display flight (AeroSpace release) 2026-08-03; #10 banner style picker + skywriter 2026-08-03; #9 clickable cargo tag 2026-08-04; #13 pre-existing comment flood guard 2026-08-04; #12 overlay level re-assert hardening 2026-08-04; #11 draggable plane (motion → per-frame sim) 2026-08-04; #15 drag scrubs flight progress + three-grab fast exit 2026-08-04. Two-session ticket protocol adopted 2026-08-03 (ported from Kal)."
---

# jiraPlane — Project State

macOS menu-bar Electron app: flies an airplane across the screen (transparent, click-through
overlay) when Jira activity involves the owner. Polls Jira DC directly every 60s with a Bearer
PAT; independent of JiraAlerts. Repo: github.com/godfreyponce/jiraPlane (**PRIVATE** — wired to
work Jira; don't flip public without the standing visibility process).

*Thin snapshot. `next_action` above names the ticket that is up now — start there.
Archive: `docs/HISTORY.md`. Queue: GitHub Issues (`gh issue list`). Protocol: `AGENTS.md`.*

## Now

*Unaccepted work only. Anything the owner has accepted belongs in `docs/HISTORY.md`, not here.*

- (empty — nothing unaccepted)

## Run / verify (do this first)

```bash
npm install
npm start        # menu-bar icon appears; "Test flight" fires a fake plane
```

No test suite — verify = run the app. `TEST_FLIGHT=1 npm start` fires a flight on launch;
`MAX_EVENTS_PER_CYCLE=0 npm start` exercises the flood-valve digest.

## Gotchas (things that would still bite you today)

- `.env` holds real work-Jira secrets copied from `JiraAlerts/.env` (gitignored) — never
  commit or quote values. Jira PAT **expires 2027-01-16**.
- `state.json` is the app's dedup state (gitignored) — NOT related to STATE.md. Delete/reset
  it to re-trigger the silent seed.
- `settings.json` (gitignored) holds user prefs — currently the banner style (#10). Separate
  file from `state.json` precisely so resetting dedup state keeps the user's choice.
- All visuals must stay in the single self-contained `plane.html` — UI iteration swaps that
  one file, nothing else.
- Overlay windows need `'screen-saver'` level + `setVisibleOnAllWorkspaces(false, {visibleOnFullScreen: true})`
  or the plane won't appear over full-screen apps. (The old "canJoinAllSpaces
  drags windows" diagnosis was WRONG — the dragger was AeroSpace all along, #6.)
  The level is asserted AFTER `setVisibleOnAllWorkspaces`, after `showInactive()`,
  and after the AeroSpace release (#12) — it can be reset by any of them; keep
  `setAlwaysOnTop` last at every re-stack point.
- **AeroSpace** moves every new window to the focused monitor and fights any
  setBounds; no window style escapes its 0.21.3 heuristics (AXCloseButton exists
  even with `closable:false`). Overlays must call `releaseFromTilingWM()` after
  show. `enableLargerThanScreen: true` kills the separate macOS menu-bar-nudge
  constraint; plane.html's per-frame `flyY` re-pin still covers residual y offsets.
- macOS never renders a CSS cursor for these overlay windows (the app is never
  activated, the window never key), so hover affordances must live in the page —
  the #9 tag and #11 plane "lift" instead of showing a pointer. Also: hover state
  must be a per-frame hit-test, never mouseenter/mouseleave — the rig outruns a
  stationary cursor and leave never fires.
- Flight motion is a per-frame JS sim since #11 — no move/swoop/bank CSS keyframes;
  streaks/twist/puffs still ride CSS off `--sync-delay`. The `'tag-hot'` IPC channel
  is any-hot (tag ∪ plane ∪ mid-drag), and main's teardown timer is cancel-on-grab /
  re-arm-on-release — since #15 the re-arm uses the renderer-sent `endAtMs`: a release
  re-seeds the flight clock from the drop x (pausedMs can go negative), and the 3rd
  grab's release starts a 4× fast-exit clock, so main can't re-derive the schedule.
