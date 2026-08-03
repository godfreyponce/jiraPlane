---
description: Build a ticket from its plan file, run the plan's verification, and stop before committing to main.
argument-hint: "[#N] (optional — defaults to STATE.md's next_action)"
---

Build one ticket from its plan file. **Start from the plan, not from a conversation you weren't in.**

## Which ticket

`$ARGUMENTS` names the issue if set; otherwise read `next_action` from STATE.md's YAML head.
Load `docs/superpowers/plans/*-issue-N.md`. If no plan file exists, stop — run `/plan-ticket N`
first. Building without the plan is exactly the failure this split exists to prevent.

## Build it

1. Use the `superpowers:executing-plans` skill. Follow the plan task by task.
2. If the plan has more than one task, create a ticket branch and commit each task once its
   review passes (`summary (refs #N)` per commit). Single-task plans stay uncommitted in the
   working tree. Either way, nothing touches main before gate 2.
3. Where the plan turns out to be wrong, **say so** rather than quietly improvising around it —
   a deviation the owner never sees is a deviation they can't catch at review.
4. Run the plan's verification steps yourself — there is no test suite, so verify = run the app:

```bash
TEST_FLIGHT=1 npm start           # overlay fires on launch
# plus whatever the plan specifies (browser previews, MAX_EVENTS_PER_CYCLE=0, dual display)
```

**Report what you actually saw**, not a claim about it. Quit the app when you're done —
never leave an `npm start` running past the session.

## Then stop — before landing anything on main

Show the owner the diff (the ticket branch, or the working tree) and wait. The owner flies the
plane — feel, seams, and timing are their pass, not yours. Do not merge or commit to main,
do not push, do not close the issue.

## Only after the owner accepts

Code commits + one docs commit, pushed together:

- **the code** — merge the ticket branch's per-task commits, or for a single-task plan commit
  the working tree as one `summary (refs #N)` commit,
- **then one docs commit** — `STATE.md` (clear the finished item out of `## Now`, advance
  `next_action` to the next ticket — ask the owner which if it isn't obvious — bump
  `last_worked_on`) together with the feature's section in `docs/HISTORY.md`.

Then push, close the issue with a one-line result, and tell the owner to `/clear` before the
next ticket.

This is STATE.md's **only** write moment. Anything you discovered along the way that isn't this
ticket goes to `gh issue create`, not into STATE.md.
