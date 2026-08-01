# jiraPlane — Project State

Electron menu-bar app that flies an airplane across the macOS screen when Jira activity
involves the owner (assignment / @mention / comment on an assigned ticket). Transparent
click-through overlay window; polls Jira DC directly every 60s with the Bearer PAT —
independent of JiraAlerts and Power Automate. Repo: github.com/godfreyponce/jiraPlane
(**PRIVATE** — wired to work Jira; don't flip public without the standing visibility process).

*Thin snapshot — update continuously as work progresses. Design spec:
`~/Developer/docs/superpowers/specs/2026-07-23-jiraplane-design.md`.
Work queue: GitHub Issues (`gh issue list`). Protocol: `AGENTS.md`.*

**Last updated: 2026-08-01**

## Now

- **#3 design ACCEPTED (2026-08-01)** via interactive prototype: 3D folded-paper cream
  glider (CSS polygons), sine-wave swoops with attitude tied to climb rate, tapered
  speed-line air, panning whoosh (needs 1-line `autoplayPolicy` in main.js), rippling
  manila banner (banner not prototyped — tune in impl). Spec:
  `~/Developer/docs/superpowers/specs/2026-08-01-jiraplane-ui-redesign-design.md` +
  accepted prototype HTML next to it. **Next: implementation plan (writing-plans), then
  swap plane.html.**
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
- Overlay windows need `'screen-saver'` level + `setVisibleOnAllWorkspaces(..., {visibleOnFullScreen: true})`
  or the plane won't appear over full-screen apps.
