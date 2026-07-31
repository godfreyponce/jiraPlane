# jiraPlane — Project State

Electron menu-bar app that flies an airplane across the macOS screen when Jira activity
involves the owner (assignment / @mention / comment on an assigned ticket). Transparent
click-through overlay window; polls Jira DC directly every 60s with the Bearer PAT —
independent of JiraAlerts and Power Automate. Repo: github.com/godfreyponce/jiraPlane
(**PRIVATE** — wired to work Jira; don't flip public without the standing visibility process).

*Thin snapshot — update continuously as work progresses. Design spec:
`~/Developer/docs/superpowers/specs/2026-07-23-jiraplane-design.md`.
Work queue: GitHub Issues (`gh issue list`). Protocol: `AGENTS.md`.*

**Last updated: 2026-07-31**

## Now

- **#2 ACCEPTED (2026-07-31):** live polling works — owner's self-assign test flew the
  plane before the Teams message arrived. Ported extras: skips own-authored comments (so
  self-comments can never fly — test the comment stream via a colleague's mention);
  "reassigned away" stream deliberately NOT ported (issue #2 scope). Flood valve testable
  with `MAX_EVENTS_PER_CYCLE=0 npm start`.
- **Next: #3 (UI phase)** — owner greenlit: redesign plane like QuakPit + slower flight.
  Flight slowed to 10s as a first guess (was 5s) — tune during #3. QuakPit technique notes
  are a comment on issue #3. plane.html query contract now includes `type=digest`
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
- Overlay windows need `'screen-saver'` level + `setVisibleOnAllWorkspaces(..., {visibleOnFullScreen: true})`
  or the plane won't appear over full-screen apps.
