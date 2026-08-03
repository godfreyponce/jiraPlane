# STATE.md's head names the ticket. Start there.

`STATE.md` opens with a YAML head. **`next_action` names the issue that is up now** — go straight
to it. Do not read the issue list and decide for yourself what's important; the owner has already
decided, and that is what the field is for. Below the head, STATE.md is a thin snapshot: what's
mid-flight, how to run/verify, and the gotchas that have already bitten. The full build archive
and per-feature detail live in `docs/HISTORY.md`.

**The work queue is GitHub Issues** (`gh issue list`). The `ready-for-agent` label means the issue
has its template sections filled in **and** the owner has green-lit it — that's the eligible
pool. `next_action` picks one out of it. A ticket also isn't ready unless it is **buildable in one
fresh session** inside the lean-window target — too big means split it before green-lighting.
Anything unlabeled still needs owner confirmation before starting. Reference issues in commits
(`refs #N`) — never `fixes #N`; issues close only at owner acceptance.
⚠️ This repo is PRIVATE, but write issues as if it were public anyway: features and
architecture only — never env values, credentials, or personal data. The local `.env` holds
real work-Jira secrets (gitignored) — never commit it or quote its values anywhere.
`state.json` is the app's dedup state (gitignored), unrelated to STATE.md — never commit it.

# One ticket = two sessions

Planning and building do not share a window. A context that has read the issue, explored the code,
and written a plan is a **poor context to then write the code in** — so the plan goes to a file and
a fresh session builds from it.

- **`/plan-ticket [#N]`** — read the ticket, write `docs/superpowers/plans/YYYY-MM-DD-issue-N.md`,
  stop. No code. The owner reads the plan (**gate 1** — cheap; nothing is built yet).
- `/clear`
- **`/build-ticket [#N]`** — build from the plan file, run the plan's verification, **report what
  you actually saw**, stop before landing anything on main. Multi-task plans build on a ticket
  branch with one commit per approved task; single-task plans stay uncommitted in the working
  tree. The owner reads the diff and flies the plane (**gate 2**).
- On the owner's accept: land the code (merge the branch, or commit the working tree), then a
  docs commit; push both together, close the issue, `/clear`.

# STATE.md is written exactly once per ticket

**In the accept-time docs commit, after the owner accepts. Never mid-session.**

Continuous updates are what makes this file drift and bloat, because a session writes it from a
context already full of its own work, and it ends up recording things the owner never accepted.
One write, at the seam:

- **Mid-session discoveries never touch STATE.md** → `gh issue create` immediately. The issue queue
  is the capture buffer (write anytime, cheap); STATE.md is the accepted-state snapshot (write once).
  Nothing is lost if a session dies — the plan file, the branch, and the issue all outlive it.
- **Acceptance lands as code commits + one docs commit, pushed together**: the code first — the
  ticket branch's per-task commits merged, or a single commit for single-task tickets — then one
  docs commit carrying `STATE.md` (Now cleared of the finished item, `next_action` advanced to
  the next ticket, `last_worked_on` bumped) and the feature's section in `docs/HISTORY.md`.
  Then close the issue.
- **"Now" holds unaccepted work only.** The moment the owner accepts something it moves to
  `docs/HISTORY.md`. Keep "Now" under ~6 lines. Gotchas stay in STATE.md — they're the memory that
  earns its place — but a gotcha lives there only while it would still bite an agent working today.

# Session hygiene — keep the window lean (owner rule, 2026-07-12)

Target **≤140k tokens of working context per session.** This works because state lives
OUTSIDE the conversation: `STATE.md` (snapshot), GitHub Issues (queue), `docs/HISTORY.md`
(archive). Suggest a fresh window at natural seams — phase acceptance, plan approval —
rather than letting a session balloon; a decision that lives only in conversation memory
doesn't exist, so write it to the right file the moment it's made.

# Verification scope (no test suite, owner rule 2026-08-03)

There is no test suite for v1 and none planned — **verify = run the app.**

- "Test flight" from the tray (or `TEST_FLIGHT=1 npm start`) exercises the overlay;
  `MAX_EVENTS_PER_CYCLE=0 npm start` exercises the flood-valve digest; self-triggered Jira
  activity (comment on/mention yourself on your own ticket) exercises polling. Standalone
  `plane.html?...` in a browser checks layout without Electron.
- At gate 2, report what you actually ran and what you actually saw — never a claim that
  "it works" without having flown it. Visual behavior the owner must judge (feel, seams,
  timing) stays the owner's pass; your run is evidence, not acceptance.
- **One running app instance at a time.** Subagents never launch the app.
- **Stop what you started.** Quit any `npm start` you launched before ending the session.

# Project rules

## Project
macOS menu-bar Electron app: flies an airplane across the screen (transparent, click-through
overlay window) when Jira activity involves the owner — assignment, @mention, or a comment
on a currently-assigned ticket. Polls Jira Data Center directly (Bearer PAT from `.env`);
fully independent of JiraAlerts and its Power Automate pipeline. All visuals live in one
self-contained `plane.html` so UI iteration swaps a single file.

## Run locally
```bash
npm install
npm start        # Electron app appears in the menu bar; use "Test flight" to fire a fake plane
```
First poll cycle seeds silently. Reset `state.json` to re-trigger the seed.

## Visual tickets
The standing habit from #3/#4: rough standalone HTML variants in `design-directions/`
(git-ignored) first, owner picks, then the plan wires the winner into `plane.html`.
Specs and plans live repo-local under `docs/superpowers/`; pre-protocol specs
(the 2026-07-23 design, the 2026-08-01 UI redesign) remain in the projects root
`~/Developer/docs/superpowers/specs/`.
