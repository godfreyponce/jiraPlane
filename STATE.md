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

- **#4 IN PROGRESS — owner leaning 3C cargo tag (2026-08-02):** round-2 variants in
  `design-directions/` (local only, git-excluded): 3a-steadicam, 3b-breather,
  3c-cargo-tag, 3d-flyby. Owner likes **3C** but found its animation unrealistic
  (tag bobbed independently, in lockstep with the glider); 3c2's keyframed "lag"
  still read the same + rope looked disconnected → built **3c3-cargo-tag-physics**:
  tag is a JS-simulated towed mass (spring-damper follows a tow anchor on the
  glider), rope drawn per-frame between the real anchor + grommet points (taut when
  dragged, sags when slack), pitch falls out of the sim. Browser-verified: rope
  stays connected, lag visible. View: `open design-directions/3c3-cargo-tag-physics.html`.
  Note: v3 breaks the pure-CSS pattern — porting to plane.html means porting the
  rAF sim too (plane.html already runs JS, so contract-compatible). Skywriter kept
  as future option → issue #5 (blocked on #4). Final reaction goes as a comment on
  #4; port winner + #3 cleanup notes when accepted.
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
- Overlay windows need `'screen-saver'` level + `setVisibleOnAllWorkspaces(..., {visibleOnFullScreen: true})`
  or the plane won't appear over full-screen apps.
