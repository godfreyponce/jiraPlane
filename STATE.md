# jiraPlane — Project State

Electron menu-bar app that flies an airplane across the macOS screen when Jira activity
involves the owner (assignment / @mention / comment on an assigned ticket). Transparent
click-through overlay window; polls Jira DC directly every 60s with the Bearer PAT —
independent of JiraAlerts and Power Automate. Repo: github.com/godfreyponce/jiraPlane
(**PRIVATE** — wired to work Jira; don't flip public without the standing visibility process).

*Thin snapshot — update continuously as work progresses. Design spec:
`~/Developer/docs/superpowers/specs/2026-07-23-jiraplane-design.md`.
Work queue: GitHub Issues (`gh issue list`). Protocol: `AGENTS.md`.*

**Last updated: 2026-07-23**

## Now

- **#1 accepted & committed** (tray + overlay queue + plane.html). `TEST_FLIGHT=1 npm start`
  fires a flight on launch. Next: **#2** (port the Jira poller from
  `~/Developer/JiraAlerts/src/jira_client.py`, READ-ONLY). **#3** (UI phase, 3 plane.html
  variants) unblocks after #2 is owner-accepted; QuakPit technique notes are on #3.
- Owner pointed at Ooble-Studio/QuakPit (MIT, the original duck-plane meeting app) as
  inspiration — reviewed; borrowable UI techniques filed as a comment on #3.
- Porting reference: `~/Developer/JiraAlerts/src/jira_client.py` (READ-ONLY — never modify
  JiraAlerts from here). Keep its patterns: dedup seen-set, silent first-run seed, flood valve.

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
