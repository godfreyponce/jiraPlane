---
glass: jiraplane
status: in-progress
last_worked_on: 2026-08-03
next_action: "#10 — Banner style picker (Cargo tag / Skywriter tray choice, persisted). Spec AND plan already exist (docs/superpowers/plans/2026-08-03-issue-10.md, owner-gated at plan review) — skip /plan-ticket, go straight to /build-ticket 10. (#5 is the same work pre-template; it closes when #10 lands. #7/#8/#9 are unlabeled — owner green-light needed.)"
blocked_on: ""
phase: "v1 shipped and accepted through #6: #1 tray + overlay queue; #2 live polling 2026-07-31; #3 B2 paper glider redesign 2026-08-02; #4 cargo-tag pendulum banner 2026-08-02; #6 continuous multi-display flight (AeroSpace release) 2026-08-03. Two-session ticket protocol adopted 2026-08-03 (ported from Kal)."
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

- #10 banner style picker: spec approved, plan approved, nothing built yet.

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
- All visuals must stay in the single self-contained `plane.html` — UI iteration swaps that
  one file, nothing else.
- Overlay windows need `'screen-saver'` level + `setVisibleOnAllWorkspaces(false, {visibleOnFullScreen: true})`
  or the plane won't appear over full-screen apps. (The old "canJoinAllSpaces
  drags windows" diagnosis was WRONG — the dragger was AeroSpace all along, #6.)
- **AeroSpace** moves every new window to the focused monitor and fights any
  setBounds; no window style escapes its 0.21.3 heuristics (AXCloseButton exists
  even with `closable:false`). Overlays must call `releaseFromTilingWM()` after
  show. `enableLargerThanScreen: true` kills the separate macOS menu-bar-nudge
  constraint; plane.html's per-frame `flyY` re-pin still covers residual y offsets.
