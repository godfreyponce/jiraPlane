# Read STATE.md first, then check the issue queue

`STATE.md` is a **thin snapshot** of right-now state: what's mid-flight, how to run/verify,
and the gotchas that have already bitten. Read it before doing anything. The design spec
lives in the projects root: `~/Developer/docs/superpowers/specs/2026-07-23-jiraplane-design.md`.

**The work queue is GitHub Issues** (`gh issue list`). The `ready-for-agent` label means the
owner has green-lit that item; anything unlabeled still needs owner confirmation before
starting. Reference issues in commits (`fixes #N`) so they close automatically.
⚠️ This repo is PRIVATE, but write issues as if it were public anyway: features and
architecture only — never env values, credentials, or personal data. The local `.env` holds
real work-Jira secrets (gitignored) — never commit it or quote its values anywhere.
`state.json` is the app's dedup state (gitignored), unrelated to STATE.md — never commit it.

**Keep state current as you work, not as an end-of-session dump:**
- Update STATE.md's "Now" section when what's mid-flight changes; keep the file under ~40 lines.
- New work discovered mid-session → `gh issue create` immediately; don't let it live only in conversation.
- After a feature is built **and the owner confirms it's good**: close its issue, refresh
  STATE.md, and commit them alongside the feature. Don't record work the owner hasn't accepted yet.

# Session hygiene — keep the window lean (owner rule, 2026-07-12)

Target **≤140k tokens of working context per session.** State lives OUTSIDE the
conversation: `STATE.md` (snapshot) + GitHub Issues (queue). Suggest a fresh window at
natural seams — milestone acceptance, plan approval — rather than letting a session balloon;
a decision that lives only in conversation memory doesn't exist, so write it to the right
file the moment it's made.

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

## Verification
No test suite planned for v1 — verify = run the app: "Test flight" for the overlay,
self-triggered Jira activity (comment on/mention yourself on your own ticket) for polling.
