# jiraPlane — Project State

Electron menu-bar app that flies an airplane across the macOS screen when Jira activity
involves the owner (assignment / @mention / comment on an assigned ticket). Transparent
click-through overlay window; polls Jira DC directly every 60s with the Bearer PAT —
independent of JiraAlerts and Power Automate. Repo: github.com/godfreyponce/jiraPlane
(**PRIVATE** — wired to work Jira; don't flip public without the standing visibility process).

*Thin snapshot — update continuously as work progresses. Design spec:
`~/Developer/docs/superpowers/specs/2026-07-23-jiraplane-design.md`.
Work queue: GitHub Issues (`gh issue list`). Protocol: `AGENTS.md`.*

**Last updated: 2026-08-02**

## Now

- **#6 BUILT — awaiting owner acceptance (2026-08-02):** continuous flight across
  all displays (commit 778ee9d): one overlay per display rendering a slice of one
  global path, synced via shared wall-clock start + `--sync-delay`; speed fixed at
  the accepted ~175px/s so duration scales with span. Root cause of the cut-short
  flight: overlay sized to primary + `setVisibleOnAllWorkspaces(true)` relocation
  (see gotcha below). Verify: `TEST_FLIGHT=1 npm start` with the external attached —
  plane should take off on the left screen and exit the right screen's far edge.
- **#4 PORTED — awaiting owner acceptance (2026-08-02):** 3c4 cargo-tag pendulum
  banner is in `plane.html` (commit 94854a1): rigid-rope sim with accepted feel
  (weight 670, drag 5.0, rope 64), old manila-note banner + ripple filter removed,
  #3 cleanup notes applied (stale 'Task 2' comment gone; s1/s3 speed-line ~73%
  scale kept, marked deliberate in a comment). Verified in Chrome via localhost —
  tag, rope, and weathervane behave like the prototype. **Owner: run a test flight
  (`TEST_FLIGHT=1 npm start` or tray → Test flight); on acceptance close #4.**
  Skywriter kept as future option → issue #5 (blocked on #4).
- **#3 ACCEPTED & CLOSED (2026-08-02):** B2 paper glider shipped (commits 2bd8dec, 9b63399,
  33e7200): 3D folded glider, sine glide, speed-lines, rippling manila banner, panning
  whoosh. `main.js` webPreferences now carries `autoplayPolicy: 'no-user-gesture-required'`
  (overlay audio autoplay). Spec + accepted prototype:
  `~/Developer/docs/superpowers/specs/2026-08-01-jiraplane-ui-redesign-*`.
- **#2 ACCEPTED (2026-07-31):** live polling works. Skips own-authored comments (test the
  comment stream via a colleague's mention); "reassigned away" stream deliberately NOT
  ported. Flood valve testable with `MAX_EVENTS_PER_CYCLE=0 npm start`. QuakPit technique
  notes are a comment on issue #3. plane.html query contract includes `type=digest`
  (banner = snippet only).
- **#1 accepted & committed** (tray + overlay queue + plane.html). `TEST_FLIGHT=1 npm start`
  fires a flight on launch.

## Run / verify (once #1 lands)

```bash
npm install
npm start        # menu-bar icon appears; "Test flight" fires a fake plane
```

## Gotchas (short form)

- `.env` holds real work-Jira secrets copied from `JiraAlerts/.env` (gitignored) — never
  commit or quote values. Jira PAT **expires 2027-01-16**.
- `state.json` is the app's dedup state (gitignored) — NOT related to STATE.md. Delete/reset
  it to re-trigger the silent seed.
- All visuals must stay in the single self-contained `plane.html` — the UI phase swaps that
  one file, nothing else.
- Overlay windows need `'screen-saver'` level + `setVisibleOnAllWorkspaces(false, {visibleOnFullScreen: true})`
  or the plane won't appear over full-screen apps. The first arg MUST be `false`:
  `true` (canJoinAllSpaces) makes macOS drag the window to the focused display —
  that's what cut flights short on the external monitor (#6). macOS also nudges
  overlays below the menu bar by per-display amounts; plane.html re-pins the
  flight line from `flyY` each frame to compensate.
