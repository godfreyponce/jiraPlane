# jiraPlane — Project State

Electron menu-bar app that flies an airplane across the macOS screen when Jira activity
involves the owner (assignment / @mention / comment on an assigned ticket). Transparent
click-through overlay window; polls Jira DC directly every 60s with the Bearer PAT —
independent of JiraAlerts and Power Automate. Repo: github.com/godfreyponce/jiraPlane
(**PRIVATE** — wired to work Jira; don't flip public without the standing visibility process).

*Thin snapshot — update continuously as work progresses. Design spec:
`~/Developer/docs/superpowers/specs/2026-07-23-jiraplane-design.md`.
Work queue: GitHub Issues (`gh issue list`). Protocol: `AGENTS.md`.*

**Last updated: 2026-08-03**

## Now

- **#6 ACCEPTANCE FAILED for tray-triggered flights (2026-08-03):** launch-time
  `TEST_FLIGHT=1` crossed end to end, but tray → Test flight stays on whichever
  display's menu bar was clicked (main-click → never reaches external;
  external-click → never starts on main). Hypothesis on the issue: macOS relocates
  the overlays to the focused display when created from the tray menu handler —
  same family as the original `setVisibleOnAllWorkspaces` gotcha. Next: instrument
  `win.getBounds()` after `showInactive()` to confirm, then defer creation past
  menu close / re-pin bounds. Full test log + code read: issue #6 comment.
- **#4 ACCEPTED & CLOSED (2026-08-02):** cargo-tag pendulum banner in `plane.html`
  (commit 94854a1): rigid-rope sim with accepted feel (weight 670, drag 5.0, rope 64);
  old manila banner + ripple filter removed. Skywriter option → issue #5 (now unblocked).
- **#3 ACCEPTED & CLOSED (2026-08-02):** B2 paper glider shipped (2bd8dec, 9b63399,
  33e7200). `main.js` webPreferences carries `autoplayPolicy: 'no-user-gesture-required'`
  (overlay audio autoplay). Spec + accepted prototype:
  `~/Developer/docs/superpowers/specs/2026-08-01-jiraplane-ui-redesign-*`.
- **#2 ACCEPTED (2026-07-31):** live polling works. Skips own-authored comments;
  "reassigned away" stream deliberately NOT ported. Flood valve testable with
  `MAX_EVENTS_PER_CYCLE=0 npm start`. plane.html query contract includes `type=digest`.
- **#1 accepted & committed** (tray + overlay queue + plane.html). `TEST_FLIGHT=1 npm start`
  fires a flight on launch.

## Run / verify

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
